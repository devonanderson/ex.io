var _ 			= require('underscore'),
	io 			= require('socket.io'),
	http 		= require('http'),
	cookie 		= require('cookie'),
	connect 	= require('connect'),
	RedisStore 	= require('socket.io/lib/stores/redis'),
  	redis   	= require('socket.io/node_modules/redis'),
  	fake 		= require('./fake.js'),
  	utils 		= require('./utils.js');

function Ionize () {

	this.defaults = {
		limit: 		0, 
		useCookie: 	true,
		cookieKey: 	'express.sid',
		useRedis: 	false,
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

	this.routes		= {};
	this.clients 	= {};
	this.redis 		= {};
};

Ionize.prototype.passToConnect = function (socket, cid, route, data, callback) {

	var req = fake.request();
	var res = fake.response();

	if(typeof data === 'function') {

		callback = data || function () { };
	}
	else {

		callback = callback || function () { };
		req.body = data;
	}

	if(route == '/ionize_connect') {
		req.headers['X-Socket-Connect']	= 'Ionize';
	}

	req.headers.cookie  = socket.handshake.headers.secureCookie || socket.handshake.headers.signedCookie || socket.handshake.headers.cookie;
	req.io 		 		= socket;
	req.socketConnect 	= callback || function () { };
	req.url 			= route;
	req.originalUrl		= req.url;
	req.socketRoute 	= utils.decodeRoute(route);
	req.clientID 		= cid;
	req.session 		= null;
	req.sessionID 		= socket.handshake.sessionID;

	this.express.handle(req, res);
};

Ionize.prototype.getSocket = function (cid, callback) {

	if(this.settings.useRedis) {

		this.redis.get(cid, function (err, id) {

			if(err || !id) {

				callback(err || new Error('Client #' + cid + ' not found in store'), null);
			}
			else if(!(socket = this.io.sockets.sockets[id])) {

				callback(new Error('Client #' + cid + ' not found in store'), null);
			}
			else {

				callback(null, socket);
			}
		});
	}
	else if((socket = this.io.sockets.sockets[clients[cid]])) {

		callback(null, socket);
	}
	else {

		callback(new Error('Client #' + cid + ' not found!'), null);
	}
}

Ionize.prototype.configAuth = function () {

	var self = this;
	
	this.io.configure(function () {

		self.io.set('authorization', function (handshake, accept) {

			if(self.settings.authorize(handshake)) {

				if(!self.settings.useCookie) {

					accept(null, true);
				}
				else if(getCookie(handshake)) {

					var sessionCookie = getCookie(handshake);
					handshake.sessionID = connect.utils.parseSignedCookie(sessionCookie, self.settings.secret);

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
	});
}

Ionize.prototype.configConnection = function () {

	var self = this;

	this.io.sockets.on('connection', function (socket) {

		self.passToConnect(socket, null, '/ionize_connect', null, function (req) {

			if(!self.settings.limit || self.settings.limit <= self.getNumberOfClients()) {

				if(self.settings.authenticate(socket, req)) {

					var clientID = self.settings.generate(socket, req);
					req.clientID = clientID;

					if(self.settings.useRedis) {

						self.redis.set(clientID, socket.id);
					}
					else {
					
						clients[clientID] = socket.id;
					}

					for(var route in self.routes) {

						(function (r) {
							socket.on(r, function (data) {
								self.passToConnect(socket, clientID, self.routes[r], data);
							});
						})(route);
					}

					socket.emit('ionize:connect', {
						clientID: clientID
					});

					self.settings.connect(null, socket, req);

					socket.on('disconnect', function(message) {

						self.settings.disconnect(null, req, message);

						if(self.settings.useRedis) {

							self.redis.del(clientID);
						} 
						else {

							clients[clientID] = null;
						}
					});
				}
				else {

					var err = new Error('Socket is not authorized to connect');
					err.code = 401;

					self.settings.connect(err, null);

					socket.emit('ionize:auth_error', err);
					socket.disconnect(err.message);
				}
			}
			else {

				var err = new Error('Max number of connections reached');
				err.code = 400;
					
				self.settings.connect(err, null);

				socket.emit('ionize:limit_reached', err);
				socket.disconnect(err.message);
			}
		});
	});
}

Ionize.prototype.configSocketIo = function (opts) {

	var defaults = {
		useRedis: 	false,
		set: 		{},
		enable: 	[]
	};

	var settings = _.extend(defaults, opts);

	var self = this;

	this.io.configure(function () {

		var set 	= settings.set
		,	enable 	= settings.enable;

		for(var i in set) {
			self.io.set(i, set[i]);
		}

		for(var i = 0; i < enable.length; i++) {
			self.io.enable(enable[i]);
		}

		if(settings.useRedis) {

			var pub 	= redis.createClient(self.settings.redisPort || null, settings.redisHost || null),
				sub 	= redis.createClient(self.settings.redisPort || null, settings.redisHost || null),
				client 	= redis.createClient(self.settings.redisPort || null, settings.redisHost || null);

			if(settings.redisPass) {

				pub.auth(settings.redisPass, function (err) { throw err });
				sub.auth(settings.redisPass, function (err) { throw err });
				client.auth(settings.redisPass, function (err) { throw err });
			}

			self.io.set('store', new RedisStore({
				redisPub 	: pub,
				redisSub 	: sub,
				redisClient : client
			}));  
		}
	});

	return this;
}

Ionize.prototype.create = function (app, opts) {

	this.settings 	= _.extend(this.defaults, opts);
	this.express	= app;
	this.express.get('/ionize_connect', function () {
		return;
	});

	return this;
}

Ionize.prototype.listen = function (server) {

	this.io = io.listen(server);

	if(this.settings.useRedis) {
		
		this.redis = redis.createClient(this.settings.redisPort || null, this.settings.redisHost || null);

		if(this.settings.redisPass) {

			this.redis.auth(this.settings.redisPass, function (err) { throw err });
		}
	}

	this.configAuth();
	this.configConnection();

	return this;
}

Ionize.prototype.route = function () {

	var args = Array.prototype.slice.call(arguments, 0);

	var name 		= args.shift(),
		callback 	= args.pop();

	this.routes[name] = '/ionize_' + utils.encodeRoute(name);

	this.express.get('/ionize_' + utils.encodeRoute(name), args, callback);

	return this;
}

Ionize.prototype.triggerSocket = function (route, cid, req, callback) {

	callback = callback || function () { };

	this.getSocket(cid, function (err, socket) {

		if(err) {

			callback(err);
			return;
		}

		socket.emit(route, req);

		callback(null);
	});

	return this;
},

Ionize.prototype.triggerRoute = function (route, cid, data, callback) {

	if(typeof data === 'function') {

		callback = data;
	}

	callback = callback || function () { };

	this.getSocket(cid, function (err, socket) {

		if(err) {

			callback(err);
			return;
		}

		this.passToConnect(socket, cid, routes[route], data);
	});

	return this;
}

Ionize.prototype.getClients = function () {

	return this.io.sockets.sockets;
}

Ionize.prototype.getClientById = function (cid, callback) {

	return this.getSocket(cid, callback);
}

Ionize.prototype.disconnectClient = function (cid, message, callback) {

	if(typeof message = 'function') {
		callback 	= message;
		message 	= '';
	}

	callback = callback || function () {};

	this.getSocket(cid, function (err, socket) {
		if(err) {
			callback(err);
		}
		else {
			socket.disconnect(message);
			callback(null);
		}	
	});

	return this;
}

Ionize.prototype.getNumberOfClients = function () {

	return _.size(this.io.sockets.sockets);
}

Ionize.prototype.getSocketIoInstance = function () {
	return this.io;
}

Ionize.prototype.middleware = function () {

	var self = this;

	return function (req, res, next) {

		if(req.headers['X-Socket-Connect'] === 'Ionize') {
			req.socketConnect(req, res);	
		}

		next();
	}
}

exports = module.exports = function () {
	return new Ionize();
}();