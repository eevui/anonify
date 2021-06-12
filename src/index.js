require('dotenv').config();

const express = require('express');
const https = require('https');

const app = express();

app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT;

let refreshToken = '';

let	accessToken = 'BQBauR5EQO2dQ1QS3tIRC122S0Az9WXFyfTEFFuXm4uQA2dVQFBmFeC555eXLGA5GdI5KCWPU-mEK2GHmxnB701_kZCAG24iRiR8Cz_d-gpQw05grXHlq1Ofxx8erLWSuB_3XhVLSQc9GmcXLkB76ZOU2-1ty2Ch8XprQADdRthsdYkEzmZZuk954NvFSoOB8Q';

app.get('/', (request, response) => {
	const code = request.query.code;
	const authorizationString = `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`;
	const requestOptions = {
		hostname: 'accounts.spotify.com',
		path: '/api/token',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		auth: authorizationString
	}
	const xRequest = https.request(requestOptions, xResponse => {
		const buffer = [];
		xResponse.on('data', data => {
			buffer.push(data);
		});

		xResponse.on('end', () => {
			const data = buffer.reduce((prev, curr) => {
				return Buffer.concat([prev, curr]);
			}, Buffer.alloc(0));
			response.setHeader('Content-Type', 'application/json');
			const responseObj = JSON.parse(data.toString());
			refreshToken = responseObj.refresh_token;
			accessToken = responseObj.access_token;
			response.send(responseObj);
		});
	});

	xRequest.on('error', err => {
		console.error(err);
		response.send(err);
	});

	const body = {
		'code': code,
		'grant_type': 'authorization_code',
		'redirect_uri': `http://localhost:${port}`
	}
	const entries = Object.keys(body).map(key => {
		return encodeURIComponent(key) + '=' + encodeURIComponent(body[key]);
	});

	xRequest.end(entries.join('&'));
});

function getCurrentId() {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'api.spotify.com',
			path: '/v1/me?fields=id',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
			}
		}

		const request = https.request(options, response => {
			const buffer = [];
			response.on('data', chunk => {
				buffer.push(chunk);
			});

			response.on('end', () => {
				const data = buffer.reduce((prev, curr) => {
					return Buffer.concat([prev, curr]);
				}, Buffer.alloc(0));
				const responseObj = JSON.parse(data.toString());
				resolve(responseObj.id);
			});
		});

		request.end();
	});
}

function createPlaylist(id) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'api.spotify.com',
			path: `/v1/users/${id}/playlists`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${accessToken}`
			}
		};

		const request = https.request(options, response => {
			const buffer = [];
			response.on('data', chunk => {
				buffer.push(chunk);
			});

			response.on('end', () => {
				const data = buffer.reduce((prev, curr) => {
					return Buffer.concat([prev, curr]);
				}, Buffer.alloc(0));
				const responseObj = JSON.parse(data.toString());
				resolve(responseObj.id);
			});
		});

		request.end(JSON.stringify({'name': 'Anonymous Playlist No. ' + Math.floor(Math.random() * 100)}));
	});
}

function trackIds(url, tracks) {
	return new Promise((resolve, reject) => {
		const options = {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${accessToken}`
			}
		};
		const request = https.request(url, options, response => {
			const buffer = [];
			response.on('data', chunk => {
				buffer.push(chunk);
			});

			response.on('end', () => {
				const data = buffer.reduce((prev, curr) => {
					return Buffer.concat([prev, curr]);
				}, Buffer.alloc(0));
				const responseObj = JSON.parse(data.toString());
				const uris = responseObj.items.map(item => {
					return item.track.uri;
				});
				resolve({
					tracks: tracks ? tracks.concat(uris) : uris,
					next: responseObj.next
				});
			});
		});
		request.end();
	}).then(res => {
		return res.next ? trackIds(res.next, res.tracks) : res.tracks;
	});
}

function playlistTracks(id) {
	return new Promise((resolve, reject) => {
		trackIds(`https://api.spotify.com/v1/playlists/${id}/tracks?fields=next,items(track(uri))`).then(uris => {
			resolve(uris);
		})
	});
}

function addTrackstoPlaylist(playlistId, tracks) {
	return new Promise((resolve, reject) => {
		const options = {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			hostname: 'api.spotify.com',
			path: `/v1/playlists/${playlistId}/tracks`
		};
		const request = https.request(options, response => {
			const buffer = [];
			response.on('data', chunk => {
				buffer.push(chunk);
			});

			response.on('end', () => {
				resolve(tracks.slice(100));
			});
		});

		request.end(JSON.stringify({'uris': tracks.slice(0, 100)}));
	}).then(remainingTracks => {
		return remainingTracks.length !== 0 ? addTrackstoPlaylist(playlistId, remainingTracks) : remainingTracks;
	});
}

app.post('/anonymize', (request, response) => {
	const playlistUrl = request.body.playlistUrl;

	const playlistId = playlistUrl.match(/(?<=spotify.com\/playlist\/)((.+(?=\?.*))|(.+))/)[0];

	getCurrentId().then(id => {
		createPlaylist(id).then(anonPlaylistId => {
			playlistTracks(playlistId).then(tracks => {
				addTrackstoPlaylist(anonPlaylistId, tracks).then(() => {
					response.send('https://open.spotify.com/playlist/' + anonPlaylistId);
				});
			});
		});
	});
});

app.listen(port);
