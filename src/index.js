const express = require('express');
const https = require('https');

const app = express();

const port = process.env.PORT;

app.get('/', (request, response) => {
	const code = request.query.code;
	const authorizationString = `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`;
	const requestOptions = {
		hostname: 'accounts.spotify.com/api/token',
		path: '/api/token',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		auth: ''
	}
	https.request()
	response.send(code);
});

app.listen(port);
