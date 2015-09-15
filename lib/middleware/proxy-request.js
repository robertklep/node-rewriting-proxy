var http     = require('http');
var parseUrl = require('url').parse;

// Override global agent
http.globalAgent = new http.Agent({
  maxSockets     : Infinity,
  keepAlive      : true,
  keepAliveMsecs : 2000,
});

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
    }).on('error', function(err) {
      proxy.logger.error({ req : req, err : err }, 'error');
      return res.sendStatus(err.code === 'ENOTFOUND' ? 404 : 502);
    }));
  };
};
