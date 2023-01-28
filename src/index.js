require('dotenv').config();


const redis = require('redis');

const client = redis.createClient();

client.on('error', error => {
	console.error(error);
});

const express = require('express');
const https = require('https');

const app = express();

app.set('views', './src/views');
app.set('view engine', 'pug');

app.use(express.urlencoded({ extended: true }));

const redirect_uri = process.env.REDIRECT_URI;
const port = process.env.PORT || 3000;

function refreshAccessToken(refreshToken) {
	return new Promise((resolve, reject) => {
		const authorizationString = `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`;
		const options = {
			hostname: 'accounts.spotify.com',
			path: '/api/token',
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			auth: authorizationString
		}
		const request = https.request(options, response => {
			const buffer = [];
			response.on('data', data => {
				buffer.push(data);
			});

			response.on('end', () => {
				const data = buffer.reduce((prev, curr) => {
					return Buffer.concat([prev, curr]);
				}, Buffer.alloc(0));
				const responseObj = JSON.parse(data.toString());
				client.setex('anonify:accessToken', responseObj.expires_in, responseObj.access_token, (err, reply) => {
					resolve(responseObj.access_token);
				});
			});
		});
		const body = {
			'grant_type': 'refresh_token',
			'refresh_token': refreshToken
		}
		const entries = Object.keys(body).map(key => {
			return encodeURIComponent(key) + '=' + encodeURIComponent(body[key]);
		});

		request.end(entries.join('&'));
	});
}

function getAccessToken() {
	return new Promise((resolve, reject) => {
		client.mget('anonify:accessToken', 'anonify:refreshToken', (err, token) => {
			if (token[0]) {
				resolve(token);
			} else {
				refreshAccessToken(token[1]).then(resolve)
			}
		});
	});
}

app.get('/auth', (request, response) => {
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
			client.mset('anonify:accessToken', responseObj.access_token, 'anonify:refreshToken', responseObj.refresh_token, (err, reply) => {
				client.expire('anonify:accessToken', responseObj.expires_in);
			});
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
		'redirect_uri': `${redirect_uri}`
	}
	const entries = Object.keys(body).map(key => {
		return encodeURIComponent(key) + '=' + encodeURIComponent(body[key]);
	});

	xRequest.end(entries.join('&'));
});

function getCurrentId() {
	return new Promise((resolve, reject) => {
		getAccessToken().then(accessToken => {
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
	});
}

function createPlaylist(id) {
	return new Promise((resolve, reject) => {
		getAccessToken().then(accessToken => {
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
	});
}

function trackIds(url, tracks) {
	return new Promise((resolve, reject) => {
		getAccessToken().then(accessToken => {
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
		}).catch(err => {
		});
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
		getAccessToken().then(accessToken => {
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
		});
	}).then(remainingTracks => {
		return remainingTracks.length !== 0 ? addTrackstoPlaylist(playlistId, remainingTracks) : remainingTracks;
	});
}

app.post('/anonify', (request, response) => {
	const playlistUrl = request.body.playlistUrl;

	if (!playlistUrl) {
		return response.render('error', {message: 'No playlist supplied. Please try again.'});
	}

	let playlistId = ''
	try {
		playlistId = playlistUrl.match(/(?<=spotify.com\/playlist\/)((.+(?=\?.*))|(.+))/)[0];
	} catch (err) {
		return response.render('error', {message: 'Playlist link is malformed. Please try again.'})
	}

	getCurrentId().then(id => {
		createPlaylist(id).then(anonPlaylistId => {
			playlistTracks(playlistId).then(tracks => {
				addTrackstoPlaylist(anonPlaylistId, tracks).then(() => {
					response.render('anonified', {playlistUrl: 'https://open.spotify.com/playlist/' + anonPlaylistId})
				});
			});
		});
	});
});

app.get('/', (request, response) => {
	response.render('index');
});

app.listen(port);
