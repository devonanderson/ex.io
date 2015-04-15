exports = module.exports = (function () {

	var	io = require('socket.io'),
		http = require('http'),
		cookie = require('cookie'),
		cookieParser = require('cookie-parser'),
		connect = require('connect'),
  	fake = require('./fake.js'),
		defaults = {
			useCookie: true,
			cookieKey: 'connect.sid',
			authorize: function (handshake, next) {
				next(null);
			},
			authenticate: function (socket, req, next) { 
				next(null);
			},
			connection: function () { }
		},
		reserved = ['/', '?', '*', '+', '(', ')'];

	function Ionize () {

		this.io = io;
		this.routes	= {};
		this.clients = {};
	};

	Ionize.prototype._passToConnect = function (socket, route, data, callback) {

		var req = fake.request()
		,		res = fake.response()
		,		handshake = socket.request;

		if(typeof data === 'function') {
			callback = data;
			req.body = {};
		}
		else {
			callback = callback || function () { };
			req.body = data;
		}

		req.headers.cookie = handshake.headers.secureCookie 
												|| handshake.headers.signedCookie
												|| handshake.headers.cookie;
		req.io = socket;
		req.callback = callback;
		req.url = route;
		req.originalUrl	= req.url;
		req.socketRoute = this._decodeRoute(route);
		req.session = null;
		req.sessionId = handshake.sessionId;

		this.express.handle(req, res);
	};

	Ionize.prototype._configAuth = function () {

		var self = this;

		this.io.use(function (socket, next) {

			var handshake = socket.request;

			self.settings.authorize(handshake, function (err) {

				if(err) {
					next(err);
				}
				else if(!self.settings.useCookie) {
					next();
				}
				else if(self._getCookie(handshake)) {
					var sessionCookie = self._getCookie(handshake);

					handshake.sessionId = cookieParser.signedCookie(sessionCookie, self.settings.secret);

					if (sessionCookie == handshake.sessionId) {
						next(new Error('Ionize: Cookie is invalid.'));
					}
					else {
						next();
					}
				}
				else {
					next(new Error('Ionize: No cookie transmitted.'));
				} 
			});
		});
	}

	Ionize.prototype._configConnection = function () {

		var self = this;

		this.io.sockets.on('connection', function (socket) {

			self._passToConnect(socket, '/ionize_connect', null, function (req) {

				self.settings.authenticate(socket, req, function (err) {

					if(err) {
						self.settings.connection(err, null);

						socket.emit('ionize:auth_error', err);
						socket.disconnect();
					}
					else {
						for(var route in self.routes) {
							(function (route) {
								socket.on(route, function (data) {

									self._passToConnect(socket, self.routes[route], data);
								});
							})(route);
						}

						self.settings.connection(null, req);

						socket.emit('ionize:connect');
					}
				});
			});
		});
	}

	Ionize.prototype._getCookie = function (handshake) {

		var settings = this.settings;

		if (handshake && handshake.headers) {
			return (handshake.headers.secureCookie && cookie.parse(handshake.headers.secureCookie)[settings.cookieKey]) 
							|| (handshake.headers.signedCookie && cookie.parse(handshake.headers.signedCookie)[settings.cookieKey])
							|| (handshake.headers.cookie && cookie.parse(handshake.headers.cookie)[settings.cookieKey]);
		}
	}

	Ionize.prototype._encodeRoute = function (route) {
		return '/ionize_' + route.replace(/:/g, '~@~');
	}

	Ionize.prototype._decodeRoute = function (route) {
		return route.replace('/ionize_', '').replace(/~@~/g, ':');
	}

	Ionize.prototype.create = function (app, opts) {

		this.settings = opts || {};

		for(var i in defaults) {
			this.settings[i] = this.settings[i] || defaults[i];
		}

		this.express = app;
		this.express.get('/ionize_connect', function () {
			return;
		});

		return this;
	}

	Ionize.prototype.listen = function (server) {

		var settings = this.settings;

		this.io = io.listen(server);

		this._configAuth();
		this._configConnection();

		return this;
	}

	Ionize.prototype.set = function () {

		var args = Array.prototype.slice.call(arguments, 0);

		var name = args.shift(),
				callback = args.pop();

		for(var i = 0, len = reserved.length; i < len; i++) {
			if(name.indexOf(reserved[i]) > -1) {
				throw new Error('Ionize: route name cannot contain Express wildcards *, +, ?, (, ), /');
			}
		}

		this.routes[name] = this._encodeRoute(name);
		this.express.get(this._encodeRoute(name), args, callback);

		return this;
	}

	Ionize.prototype.on = function (event, callback) {

		this.settings[event] = callback || function () { };

		return this;
	} 

	Ionize.prototype.configure = function (func, callback) {

		this.settings[func] = callback || function () { };

		return this;
	}	

	Ionize.prototype.trigger = function (route, socket, data, callback) {

		if(typeof data === 'function') {
			callback = data;
			data = {};
		}

		callback = callback || function () { };

		if(!this.routes[route]) {
			callback(new Error('Ionize: Route has not been defined.'));
		}
		else {
			this._passToConnect(socket, this.routes[route], data, callback);
		}

		return this;
	}

	Ionize.prototype.middleware = function () {

		return function (req, res, next) {

			if(req.io) {
				req.callback(req, res);
			}

			next();
		}
	}

	return new Ionize();
})();