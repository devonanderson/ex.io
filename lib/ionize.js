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
		authorize: 		function (handshake, callback) {
			callback(null, true);
		},
		authenticate: 	function (socket, req, callback) { 
			callback(null, true);
		},
		generate: 		function (socket, req, callback) { 
			callback(socket.id);
		},
		connection: function () { },
		disconnect: function () { },
	};

	this.eventMap = [ 
		'connection', 
		'disconnect'
	];
	this.functMap = [ 
		'authenticate', 
		'authorize', 
		'generate' 
	];

	this.io 		= io;
	this.routes		= {};
	this.clients 	= {};
	this.redis 		= {};
};

Ionize.prototype.passToConnect = function (socket, route, data, callback) {

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
	req.socketRoute 	= utils.decodeRoute(route).replace('/ionize_', '');
	req.session 		= null;
	req.sessionID 		= socket.handshake.sessionID;

	this.express.handle(req, res);
};

Ionize.prototype.getSocket = function (cid, callback) {

	if(this.settings.useRedis) {

		var self = this;

		this.redis.get(cid, function (err, id) {

			if(err || !id) {

				callback(err || new Error('Ionize: Client not found in store'), null);
			}
			else if(!(socket = self.io.sockets.sockets[id])) {

				callback(new Error('Ionize: Client not found in store'), null);
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

		callback(new Error('Ionize: Client not found in store'), null);
	}
}

Ionize.prototype.configAuth = function () {

	var self = this;
	
	this.io.configure(function () {

		self.io.set('authorization', function (handshake, accept) {

			self.settings.authorize(handshake, function (err, res) {

				if(!res) {

					accept(err, false);
				}
				else if(!self.settings.useCookie) {

					accept(null, true);
				}
				else if(getCookie(handshake)) {

					var sessionCookie = getCookie(handshake);
					handshake.sessionID = connect.utils.parseSignedCookie(sessionCookie, self.settings.secret);

					if (sessionCookie == handshake.sessionID) {
						
						return accept('Ionize: Cookie is invalid.', false);
					}

					accept(null, true);
				} 
				else {

					return accept('Ionize: No cookie transmitted.', false);
				}
			});
			
		});
	});
}

Ionize.prototype.configConnection = function () {

	var self = this;

	this.io.sockets.on('connection', function (socket) {

		self.passToConnect(socket, '/ionize_connect', null, function (req) {

			if(!self.settings.limit || self.settings.limit <= self.getNumberOfClients()) {

				self.settings.authenticate(socket, req, function (err, res) {

					if(!res) {

						var err = new Error(err);
						err.code = 401;

						self.settings.connect(err, null);

						socket.emit('ionize:auth_error', err);
						socket.disconnect();
					}
					else {
						socket.ionize = {};
						self.settings.generate(socket, req, function (cid) {
							
							socket.ionize.id = cid;

							if(self.settings.useRedis) {

								self.redis.set(cid, socket.id);
							}
							else {
							
								clients[cid] = socket.id;
							}

							for(var route in self.routes) {

								(function (r) {
									socket.on(r, function (data) {
										self.passToConnect(socket, self.routes[r], data);
									});
								})(route);
							}

							self.settings.connection(req);

							socket.emit('ionize:connect', {
								id: cid
							});

							socket.on('disconnect', function() {

								self.settings.disconnect(req);

								if(self.settings.useRedis) {
									self.redis.del(cid);
								} 
								else {
									clients[cid] = null;
								}
							});
						});
					}
				});
			}
			else {

				var err = new Error('Ionize: Max number of connections reached');
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

	var events 		= this.defaults.events;

	this.settings 	= _.extend(this.defaults, opts);
	this.express	= app;

	if(opts.events) {
		this.settings.events = _.extend(events, opts.events);
	}

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

Ionize.prototype.on = function (event, callback) {

	callback = callback || function () { };

	if(_.contains(this.eventMap, event)) {

		this.settings[event] = callback;
	}
}

Ionize.prototype.set = function (funct, callback) {

	callback = callback || function () { };

	if(_.contains(this.functMap, funct)) {

		this.settings[funct] = callback;
	}
}	

Ionize.prototype.triggerSocket = function (route, cid, req, callback) {

	callback = callback || function () { };

	if(typeof cid === 'object') {
		cid.emit(route, req);
		callback(null);
	}
	else {
		this.getSocket(cid, function (err, socket) {

			if(err) {
				callback(err);
				return;
			}

			socket.emit(route, req);
			callback(null);
		});
	}

	return this;
}

Ionize.prototype.triggerRoute = function () {

	var args 	= Array.prototype.slice.call(arguments, 0)
	,	route 	= args.shift()
	,	socket
	,	cid
	,	data
	, 	callback;

	if(typeof args[0] === 'object') {
		socket 	= args.shift();
	}
	else {
		cid 	= args.shift();
	}
	if(typeof args[0] === 'function') {
		callback 	= args[0];
		data 		= null;
	}
	else {
		data = args[0];
	}

	callback = callback || args[1] || function () { };

	if(!this.routes[route]) {
		callback(new Error('Ionize: Route has not been defined.'));
	}
	else if(socket) {
		this.passToConnect(socket, this.routes[route], data);
		callback(null);
	}
	else {
		var self = this;
		this.getSocket(cid, function (err, socket) {

			if(err) {
				callback(err);
				return;
			}

			this.passToConnect(socket, self.routes[route], data);
			callback(null);
		});
	}

	return this;
}

Ionize.prototype.getClients = function () {

	return this.io.sockets.sockets;
}

Ionize.prototype.getClientById = function (cid, callback) {

	return this.getSocket(cid, callback);
}

Ionize.prototype.disconnectClient = function (cid, callback) {

	callback = callback || function () {};

	if(typeof cid === 'object') {
		cid.disconnect();
		callback(null);
	}
	else {
		this.getSocket(cid, function (err, socket) {
			
			if(err) {
				callback(err);
			}
			else {
				socket.disconnect();
				callback(null);
			}	
		});
	}

	return this;
}

Ionize.prototype.getNumberOfClients = function () {

	return _.size(this.io.sockets.sockets);
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