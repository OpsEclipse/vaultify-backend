import { MongoClient, ServerApiVersion } from 'mongodb';
const uri =
	'mongodb+srv://sparshgirishshah0747:156Coniker@database.gzgwffk.mongodb.net/?retryWrites=true&w=majority&appName=database';

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
	tls: true, // <-- TLS enabled here at top-level options
	serverApi: {
		version: ServerApiVersion.v1,
		strict: true,
		deprecationErrors: true,
	},
});

export let db;

export const connectToDB = async () => {
	if (db) return db;
	await client.connect();
	await client.db('admin').command({ ping: 1 });
	console.log(
		'Pinged your deployment. You successfully connected to MongoDB!'
	);
	db = client.db('vaultify');
	return db;
};

process.on('SIGINT', async () => {
	await client.close();
	console.log('database connection successfully terminated');
	process.exit(0);
});
