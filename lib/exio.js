var _ 			= require('underscore'),
	io 			= require('socket.io'),
	http 		= require('http'),
	cookie 		= require('cookie'),
	connect 	= require('connect'),
	fake 		= require('./fake.js'),
	RedisStore 	= require('socket.io/lib/stores/redis'),
  	redis   	= require('socket.io/node_modules/redis');

var Exio = function () {

	var settings = {
		limit: 			0, 
		cookie_key: 	'express.sid',
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
		disconnect: 	function () { },
		transports: [
			'websocket',
			'flashsocket',
			'htmlfile',
			'xhr-polling',
			'jsonp-polling'
		]
	};

	var routes 			= {},
		clients 		= {},
		https 			= false;
	
	var express;
	var client;

	var configApp = function (app, opts) {

		express 	= app;
		settings 	= _.extend(settings, opts);

		express.get('/exio_connect', function () {
			return;
		});
	}

	var configIO = function (io) {

		io.configure(function () {

			io.set('authorization', function (handshake, accept) {

				if(settings.authorize.call(_this, handshake)) {

					if(getCookie(handshake)) {

						var sessionCookie = getCookie(handshake);
						handshake.sessionID = connect.utils.parseSignedCookie(sessionCookie, settings.secret);

						if (sessionCookie == handshake.sessionID) {
							
							return accept('Cookie is invalid.', false);
						}

						accept(null, true);
					} 
					else {
						
						return accept('No cookie transmitted.', false);
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

				io.set('transports', settings.transports); 

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
	}

	var passToConnect = function (socket, cid, route, data, callback, error) {

		var req = fake.request();
		var res = fake.response();

		if(typeof data === 'function') {

			callback = data || function () { };
		}
		else {
  
			callback = callback || function () { };
			req.data = data;
		}

		req.io 		 	= socket;
		req.end 		= callback;
		req.err 		= error || function () { };
		req.headers 	= _.extend({ 'Ex.io-Request': true }, req.headers);
		req.url 		= route;
		req.originalUrl	= req.url;
		req.socketRoute = decodeRoute(route);
		req.clientID 	= cid;
		req.session 	= null;
		req.sessionID 	= socket.handshake.sessionID;

		express.handle(req, res);
	};

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

					callback(err || new Error('Client #' + cid + ' not found in store'), null);
				}
				else if(!(socket = io.sockets.sockets[id])) {

					callback(new Error('Client #' + cid + ' not found in store'), null);
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

	var getApp = function () {

		return {

			listen: function (server) {

				io 		= io.listen(server),
				_this 	= this;

				if(settings.production) {
					
					client = redis.createClient(settings.redis_port || null, settings.redis_host || null);

					if(settings.redis_pass) {

						client.auth(settings.redis_pass, function (err) { throw err });
					}
				}

				configIO(io);

				io.sockets.on('connection', function (socket) {

					passToConnect(socket, null, '/exio_connect', function (socket, req) {

						if(!settings.limit || settings.limit <= this.getNumberOfClients()) {

							if(settings.authenticate.call(_this, socket)) {

								var clientID = settings.generate.call(this, socket);

								if(settings.production) {

									client.set(clientID, socket.id);
								}
								else {
								
									clients[clientID] = socket.id;
								}

								settings.connect.call(_this, null, clientID);

								for(var route in routes) {

									(function (route) {

										socket.on(route, function (data) {

											passToConnect(socket, clientID, routes[route].route, data, routes[route].error);
										});
									})(route);
								}

								socket.on('disconnect', function(message) {

									settings.disconnect.call(_this, {
										socket: 	socket,
										session: 	req.session,
										clientID: 	clientID,
										message: 	message
									});

									if(settings.production) {

										client.del(clientID);
									} 
									else {

										clients[clientID] = null;
									}
								});
							}
							else {

								var err = new Error('Socket is not authorized to connect');
								err.code = 401;

								settings.connect.call(_this, err, null);

								socket.emit('not_authed', err);
								socket.disconnect(err.message);
							}
						}
						else {

							var err = new Error('Max number of connections reached');
							err.code = 400;
								

							settings.connect.call(this, err, null);

							socket.emit('limit_reached', err);
							socket.disconnect(err.message);
						}
					});
				});

				return {

					route: function () {

						var args = Array.prototype.slice.call(arguments, 0);

						var name 		= args.shift(),
							error 		= args.pop(),
							callback 	= args.pop();

						routes[name] = {
							route: '/exio_' + encodeRoute(name),
							error: error
						};

						express.get('/exio_' + encodeRoute(name), args, callback);

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

					triggerRoute: function (route, cid, data, callback) {

						if(typeof data === 'function') {

							callback = data;
						}

						callback = callback || function () { };

						getSocket(cid, function (err, socket) {

							if(err) {

								callback(err);
								return;
							}

							passToConnect(socket, cid, routes[route].route, data, function () {

								callback(null);
							});
						});
					},

					getClients: function () {

						return io.sockets.sockets;
					},

					getClientById: function (cid, callback) {

						getSocket(cid, callback);
					},

					disconnectClient: function (cid, callback) {

						getSocket(cid, function (err, socket) {
							if(err) {
								callback(err);
							}
							else {
								socket.disconnect('App level disconnect');
								callback(null);
							}	
						});
					},

					getNumberOfClients: function () {

						return _.size(io.sockets.sockets);
					}
				};
			}
		};
	}

	var encodeRoute = function (route) {

		if(route.indexOf('~@~') > -1 || route.indexOf('~$~') > -1) {
			throw new Error('Illegal token in route name, ~@~ and ~$~ are reserved for route encoding');
		}
		else {
			return route.replace(/:/g, '~@~').replace(/\//g, '~$~');
		}

	}

	var decodeRoute = function (route) {

		return route.replace(/~@~/g, ':').replace(/~\$~/g, '/').replace('/exio_', '');
	}

	return {

		create: function (app, opts) {

			configApp(app, opts);

			return getApp();
		},

		middleware: function (req, res, next) {

			if(req.headers['Ex.io-Request']) {
				
				req.end(req.io, req);
			}
			
			next();
		}
	};
}();

module.exports = Exio;