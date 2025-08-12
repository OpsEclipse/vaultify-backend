import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import express from 'express';
import  dotenv from 'dotenv';
dotenv.config();

const s3Client = new S3Client({
	region: 'us-east-2',
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
});
const getUrlBySong = async (song) => {
    const command = new GetObjectCommand({
		Bucket: 'vaultifys3lol',
		Key: `${song}.mp3`,
	});
	const url = await getSignedUrl(s3Client, command, {
		expiresIn: 3600,
	}); // 1 hour expiry, optional
    return url;
};
const router = express.Router();
router.route('/').get(async(req, res) => {
    const {awsName} = req.query;
    const url = await getUrlBySong(`${awsName}`)
    res.send(url);
})
export default router;