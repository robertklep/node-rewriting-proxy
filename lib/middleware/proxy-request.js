var http  = require('http');
var url   = require('url');

// XXX: configure this?
http.globalAgent.maxSockets = 100;

module.exports = function(proxy) {
  return function(req, res, next) {
    proxy.logger.trace({ req : req }, 'proxied');
    var parsedUrl = url.parse(req.url);
    req.pipe(http.request({
      hostname  : parsedUrl.hostname,
      port      : ~~parsedUrl.port || 80,
      path      : parsedUrl.path + (parsedUrl.hash || ''),
      method    : req.method,
      headers   : req.headers,
    }, function(httpResponse) {
      res.writeHead(httpResponse.statusCode, httpResponse.headers);
      return httpResponse.pipe(res);
    }));
  };
};
