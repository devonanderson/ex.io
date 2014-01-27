var _ 			= require('underscore'),
	io 			= require('socket.io'),
	http 		= require('http'),
	cookie 		= require('cookie'),
	connect 	= require('connect'),
	RedisStore 	= require('socket.io/lib/stores/redis'),
  	redis   	= require('socket.io/node_modules/redis');

var Exio = function () {

	var settings = {
		limit: 			0, 
		cookie_key: 	'connect.sid',
		production: 	false,
		authenticate: 	function () { 
			return true;
		},
		authorize: 		function () {
			return true;
		},
		generate: 		function (socket) { 
			return socket.id;
		},
		connect: 		function () { },
		disconnect: 	function () { }
	};

	var routes 		= {},
		clients 	= {},
		client;

	var getCookie = function (handshake) {

		if (handshake) {
			
			return 	(handshake.headers.secureCookie && cookie.parse(handshake.headers.secureCookie)[settings.cookie_key]) ||
					(handshake.headers.signedCookie && cookie.parse(handshake.headers.signedCookie)[settings.cookie_key]) ||
					(handshake.headers.cookie && cookie.parse(handshake.headers.cookie)[settings.cookie_key]);
		}
	}

	var getSocket = function (cid, callback) {

		if(settings.production) {

			client.get(cid, function (err, id) {

				if(err || !id) {

					callback(err || new Error('Client ID not found in store!'), null);
				}
				else if(!(socket = io.sockets.sockets[id])) {

					callback(new Error('Client #' + cid + ' not found!'), null);
				}
				else {

					callback(null, socket);
				}
			});
		}
		else if((socket = io.sockets.sockets[clients[cid]])) {

			callback(null, socket);
		}
		else {

			callback(new Error('Client #' + cid + ' not found!'), null);
		}
	}

	return {

		http: function (opts) {

			settings = _.extend(settings, opts);

			return this;
		},

		https: function (opts) {

			settings = _.extend(settings, opts);

			//need to implement https auth

			return this;
		},

		listen: function (server) {

			io 		= io.listen(server),
			_this 	= this;

			if(settings.production) {
				
				client = redis.createClient(settings.redis_port || null, settings.redis_host || null);

				if(settings.redis_pass) {

					client.auth(settings.redis_pass, function (err) { throw err });
				}
			}

			io.configure(function () {

				io.set('authorization', function (handshake, accept) {

					if(settings.authorize.call(_this, handshake)) {

						if(!settings.cookie_key) {

							accept(null, true);
						}
						else if(getCookie(handshake)) {

							var sessionCookie = getCookie(handshake);

							handshake.sessionID = connect.utils.parseSignedCookie(sessionCookie, settings.secret);

							if (sessionCookie == handshake.sessionID) {
								
								return accept('Cookie is invalid.', false);
							}
						} 
						else {
							
							return accept('No cookie transmitted.', false);
						}

						if(settings.store) { 
							
							settings.store.load(handshake.sessionID, function (err, session) {
								
								if (err || !session) {
									
									accept('No session found', false);
								} 
								else {

									handshake.session = session;
										
									accept(null, true);
								}
							});
						}
						else {

							accept(null, true);
						}
					}
					else {

						accept('Not authorized', false);
					}
				});

				if(settings.production) {

					io.enable('browser client minification');  // send minified client
					io.enable('browser client etag');          // apply etag caching logic based on version number
					io.enable('browser client gzip');          // gzip the file
					io.set('log level', 1); 

					io.set('transports', [
						'websocket',
						'flashsocket',
						'htmlfile',
						'xhr-polling',
						'jsonp-polling'
					]); 

					var pub 	= redis.createClient(settings.redis_port || null, settings.redis_host || null),
						sub 	= redis.createClient(settings.redis_port || null, settings.redis_host || null),
						client 	= redis.createClient(settings.redis_port || null, settings.redis_host || null);

					if(settings.redis_pass) {

						pub.auth(settings.redis_pass, function (err) { throw err });
						sub.auth(settings.redis_pass, function (err) { throw err });
						client.auth(settings.redis_pass, function (err) { throw err });
					}

					io.set('store', new RedisStore({
						redisPub 	: pub,
						redisSub 	: sub,
						redisClient : client
					}));  
				}
			});

			io.sockets.on('connection', function (socket) {

				if(!settings.limit || settings.limit <= this.getNumberOfClients()) {

					if(settings.authenticate.call(_this, socket)) {

						settings.connect.call(_this, null, socket);

						var clientId = settings.generate.call(this, socket);

						if(settings.production) {

							client.set(clientId, socket.id);
						}
						else {
						
							clients[clientId] = socket.id;
						}


						for(var route in routes) {

							(function (route) {

								socket.on(route, function (req) {

									req = req || {};
									
									req.session 	= socket.handshake.session || null;
									req.route 		= route;
									req.io 			= socket;		
									req.clientId 	= clientId;
									
									routes[route](req);
								});
							})(route);
						}

						socket.on('disconnect', function() {

							settings.disconnect.call(_this, {
								socket: 	socket,
								session: 	socket.handshake.session || null,
								clientId: 	clientId
							});

							if(settings.production) {

								client.del(clientId);
							} 
							else {

								clients[clientId] = null;
							}
						});
					}
					else {

						var err = {
							code: 		401,
							message: 	'Socket is not authorized to connect'
						};

						settings.connect.call(_this, err, null);

						socket.emit('not_authed', err);
					}
				}
				else {

					var err = {
						code: 		400,
						message: 	'Max number of connections reached!'
					};

					settings.connect.call(this, err, null);

					socket.emit('limit_reached', err);
				}
			});

			return this;
		},

		route: function (name, callback) {

			callback = callback || function () { };

			if(typeof callback === 'object') {

				for(var method in callback) {

					routes[name + ':' + method] = callback[method];
				}
			}
			else {

				routes[name] = callback;
			}

			return this;
		},

		triggerSocket: function (route, cid, req, callback) {

			callback = callback || function () { };

			getSocket(cid, function (err, socket) {

				if(err) {

					callback(err);
					return;
				}

				socket.emit(route, req);

				callback(null);
			});
		},

		triggerRoute: function (route, cid, req, callback) {

			callback = callback || function () { };

			getSocket(cid, function (err, socket) {

				if(err) {

					callback(err);
					return;
				}

				req = req || {};
									
				req.session 	= socket.handshake.session || null;
				req.route 		= route;
				req.io 			= socket;		
				req.clientId 	= cid;
				
				routes[route](req);

				callback(null);
			});
		},

		getClients: function () {

			return clients;
		},

		getClientById: function (sid) {

			return clients[sid];
		},

		getNumberOfClients: function () {

			return _.size(clients);
		},

		clientExists: function (sid) {

			return _.has(clients, sid);
		}
	};
}();

module.exports = Exio;