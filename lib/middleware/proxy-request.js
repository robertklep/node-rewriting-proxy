var http     = require('http');
var parseUrl = require('url').parse;

// Should already be Infinity with recent Node versions,
// but can't hurt to be explicit.
http.globalAgent.maxSockets = Infinity;

// Allow connection reuse.
http.globalAgent.keepAlive = true;
http.globalAgent.keepAliveMsecs = 3000;

module.exports = function(proxy) {
  return function(req, res, next) {
    proxy.logger.trace({ req : req }, 'proxied');
    var url = parseUrl(req.url);
    req.pipe(http.request({
      hostname  : url.hostname,
      port      : ~~url.port || 80,
      path      : url.path + (url.hash || ''),
      method    : req.method,
      headers   : req.headers,
    }, function(httpResponse) {
      res.writeHead(httpResponse.statusCode, httpResponse.headers);
      return httpResponse.pipe(res);
    }));
  };
};
