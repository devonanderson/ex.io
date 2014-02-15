exports.getCookie = function (handshake) {

	if (handshake) {
		
		return 	(handshake.headers.secureCookie && cookie.parse(handshake.headers.secureCookie)[settings.cookie_key]) ||
				(handshake.headers.signedCookie && cookie.parse(handshake.headers.signedCookie)[settings.cookie_key]) ||
				(handshake.headers.cookie && cookie.parse(handshake.headers.cookie)[settings.cookie_key]);
	}
}

exports.encodeRoute = function (route) {

	if(route.indexOf('~@~') > -1 || route.indexOf('~$~') > -1) {
		throw new Error('Illegal token in route name, ~@~ and ~$~ are reserved for route encoding');
	}
	else {
		return route.replace(/:/g, '~@~').replace(/\//g, '~$~');
	}
}

exports.decodeRoute = function (route) {

	return route.replace(/~@~/g, ':').replace(/~\$~/g, '/').replace('/exio_', '');
}