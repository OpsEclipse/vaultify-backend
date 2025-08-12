import express from 'express';
import cors from 'cors';
import userRoute from './routes/users.js';
import playlistRoute from './routes/playlist.js';
import { connectToDB } from './db/connection.js';
import songRoute from './routes/song.js';

const app = express();
const PORT = 8080;

app.use(cors());

app.use(express.json());

app.use('/users', userRoute);
app.use('/playlist', playlistRoute);
app.use('/song', songRoute);

connectToDB()
	.then(
		app.listen(PORT, () => {
			console.log('Server is running on port', PORT);
		})
	)
	.catch((err) => console.log('error connecting to db', err));
