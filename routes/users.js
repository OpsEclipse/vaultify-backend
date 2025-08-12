import express from 'express';
import {db} from '../db/connection.js'
import bcrypt from 'bcrypt'
const router = express.Router();

router.route('/').get(async(req, res) => {
    let collection = await db.collection('users');
    const {user, password} = req.query;
    let userInfo = {
        user,
    }
    const result = await collection.findOne(userInfo);
    if (result && await bcrypt.compare(password, result.password)){
        res.send(result);
    }
    else {
        res.status(404).send('user not found');
    }
})
.post(async(req, res) => {
    let collection = await db.collection('users');
    const { user, password, } = req.body;
	let userInfo = {
		user,
		password: await hashPassword(password),
	};
    const dupe = await collection.findOne({ user });
	if (dupe) {
		return res
			.status(409)
			.json({ message: 'Username already exists.' }); // 409 = Conflict
	}
    let results = await collection.insertOne(userInfo);
	res.status(201).send(results);
})
const hashPassword = async (password) => {
	const saltRounds = 10;
	const hash = await bcrypt.hash(password, saltRounds);
	return hash;
};

export default router;
