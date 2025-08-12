import express from 'express';
import axios from 'axios';
import youtubeSearchApi from 'youtube-search-api';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import PQueue from 'p-queue';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { db } from '../db/connection.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import  dotenv from 'dotenv';
dotenv.config();
const router = express.Router();
const client_id = process.env.SPOTIFY_CLIENT_ID || '04cc01e0d1034491bc40388761250cce'; //spotify

const client_secret =
	process.env.SPOTIFY_CLIENT_SECRET ||
	'5c456651e4674be49b150d74d8f5d0d7';

const s3Client = new S3Client({
	region: 'us-east-2',
	credentials: {
		accessKeyId:
			process.env.AWS_ACCESS_KEY_ID || 'AKIA2UC4VYGII7JA6AJN',
		secretAccessKey:
			process.env.AWS_SECRET_ACCESS_KEY ||
			'Q8vdhaFTgv7VGjVykCy0H9LiltJ1RVOzGenjJ',
	},
});

const getUrlBySong = async (song) => {
	const command = new GetObjectCommand({
		Bucket: 'vaultifys3lol',
		Key: song,
	});
	const url = await getSignedUrl(s3Client, command);
	return url;
};

const getAccessToken = async () => {
	try {
		const response = await axios.post(
			'https://accounts.spotify.com/api/token',
			new URLSearchParams({
				grant_type: 'client_credentials',
				client_id,
				client_secret,
			}),
			{
				headers: {
					'Content-Type':
						'application/x-www-form-urlencoded',
				},
			}
		);
		return response.data.access_token;
	} catch (error) {
		console.error(
			'Error fetching access token:',
			error.response?.data || error.message
		);
	}
};
/**
 * Downloads audio from a YouTube video ID and uploads it to S3.
 * @param {string} id - The YouTube video ID to download audio from.
 * @param {string} name - The name to save the audio file as in S3.
 * @returns {Promise<void>} Resolves when download and upload complete successfully.
 * @throws Will throw an error if downloading or uploading fails.
 */
const downloadAudio = async (name) => {
	const searchRes = await youtubeSearchApi.GetListByKeyword(
		name,
		false,
		1,
		{ type: 'video' }
	);
	let id = searchRes.items[0]?.id || null;

	return new Promise((resolve, reject) => {
		const downloadsDir = path.join(os.homedir(), 'Downloads');
		/*const outputTemplate = path.join(
			downloadsDir,
			'%(title)s.%(ext)s'
		);*/

		const ytProcess = spawn('yt-dlp', [
			'-x',
			'--audio-format',
			'mp3',
			'-o',
			'-',
			'--cookies',
			'./cookies.txt',
			`https://www.youtube.com/watch?v=${id}`,
		]);
		ytProcess.on('error', (err) => {
			reject(new Error(`yt-dlp process error: ${err.message}`));
		});
		
		const uploadParams = {
			Bucket: 'vaultifys3lol',
			Key: `${name}.mp3`, // or any naming scheme
			Body: ytProcess.stdout,
			ContentType: 'audio/mpeg',
		};
		const upload = new Upload({
			client: s3Client,
			params: uploadParams,
		});

		upload
			.done()
			.then(() => {
				mongoAdd(name).then(() => {
					resolve(id);
				});
			})
			.catch((uploadErr) => {
				reject(uploadErr);
			});
	});
};
const mongoCheck = async (name) => {
	let collection = await db.collection('songs');
	let song = {
		name,
	};
	const dupe = await collection.findOne(song);
	if (dupe) {
		return false;
	} else {
		return true;
	}
};
const mongoAdd = async (name) => {
	let collection = await db.collection('songs');
	let song = {
		name,
	};
	let results = await collection.insertOne(song);
	return true;
};
router.route('/').get(async (req, res) => {
	console.log(process.env.SPOTIFY_CLIENT_ID);
	let token = await getAccessToken();
	let { playlistID } = req.query;
	if (!playlistID) {
		return res.status(400).json({
			error: 'playlistID query parameter is required',
		});
	}
	let response = await axios.get(
		`https://api.spotify.com/v1/playlists/${playlistID}`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
			},
		}
	);
	console.log(response);
	//{}
	const responseObj = {
		total_tracks: response.data.tracks.total,
		image: response.data.images[0].url,
		name: response.data.name,
		owner: response.data.owner.display_name,
	};
	res.json(responseObj);
});
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const queue = new PQueue({ concurrency: 5 }); // max 2 downloads at a time
router.route('/tracks').get(async (req, res) => {
	let token = await getAccessToken();
	let { playlistID } = req.query;
	let isFinished = false;
	let response;
	let tracks = [];
	let path = `https://api.spotify.com/v1/playlists/${playlistID}/tracks?fields=items(added_at,track(name,artists(name),album(name,images.url),duration_ms)),next&limit=50`;
	while (!isFinished) {
		response = await axios.get(path, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});
		const playlistItems = response.data.items;
		playlistItems.forEach((item) => {
			if (!item.track) return;
			const addedDate = new Date(item.added_at);
			const simpleDate = addedDate.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
			const ms = item.track.duration_ms;
			const minutes = Math.floor(ms / 60000);
			const seconds = Math.floor((ms % 60000) / 1000)
				.toString()
				.padStart(2, '0');

			const duration = `${minutes}:${seconds}`; // e.g. "3:26"

			tracks.push({
				name: item.track.name,
				awsName: `${item.track.name} by ${item.track.artists
					.map((a) => a.name)
					.join(' and ')}`,
				artists: item.track.artists.map((a) => a.name),
				image: item.track.album.images?.[0]?.url || null, // first image URL
				duration,
				addedOn: simpleDate,
				albumName: item.track.album.name,
			});
		});
		if (response.data.next === null) {
			isFinished = true;
		} else {
			path = response.data.next;
		}
	}

	await Promise.all(
		tracks.map(async (track) => {
			let trackName = `${track.name} by ${track.artists.join(
				' and '
			)}`;
			let check = await mongoCheck(trackName);
			if (check) {
				queue.add(async () => {
					let vidID = await downloadAudio(trackName);
					track.youtubeID = vidID;
					console.log(`${trackName} stored in database`);
				});
			} else {
				console.log(`${trackName} already in database`);
			}
			await delay(100);
		})
	);
	queue.on('error', (error) => {
		console.error('Queue error:', error);
	});
	await queue.onIdle();
	console.log(tracks);
	res.json(tracks);
});

//678TZAYq3HW7JImhFqkyKH
export default router;
