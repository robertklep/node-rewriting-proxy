/* jshint esnext: false */

// Fuck You, Node.
require('events').EventEmitter.prototype._maxListeners = 1000;

// TEMPORARY
require('long-stack-traces');
process.on('uncaughtException', function(err) {
  console.error('Uncaught exception:\n', err);
  console.error(err.stack);
});

var bunyan      = require('bunyan');
var RuleLoader  = require('./rule-loader').RuleLoader;
var express     = require('express');
var compression = require('compression');

var Proxy = function Proxy(options) {
  if (this.constructor.name !== 'Proxy') {
    return new Proxy(options);
  }
  this.options = options;

  // Initialize logger.
  this.logger = bunyan.createLogger({
    name        : 'node-rewriting-proxy',
    level       : options['log-level'],
    stream      : process.stderr,
    serializers : {
      req : bunyan.stdSerializers.req
    }
  });

  // Load rules.
  this.rules = RuleLoader(options);
  if (! this.rules) {
    console.error('Unable to load rules, giving up...');
    process.exit(0);
  }

  // Start HTTP server which is going to act as a proxy.
  this.startServer(options);
};

Proxy.prototype.startServer = function(options) {
  this.app    = express();
  this.server = this.app.listen(options.port, options.host);

  // Configure Express.
  this.app.disable('x-powered-by');
  this.app.disable('etag');

  // Use compression middleware to compress responses.
  this.app.use(compression());

  // Use Express middleware to implement filtering.
  this.app.use(
    require('./middleware/block')(this),
    require('./middleware/check-finished')(this),
    require('./middleware/modify-request')(this),
    require('./middleware/check-finished')(this),
    require('./middleware/modify-response')(this),
    require('./middleware/check-finished')(this),
    require('./middleware/proxy-request')(this)
  );
};

// Match a rule against a request.
Proxy.prototype.ruleMatchesRequest = function(req, rule) {
  var match = rule.host ? rule.host.test(req.hostname) : true;
  match &= rule.path ? rule.path.test(req.pathname || req.path) : true; // XXX: .pathname is *only* the path, no qs
  return match;
};

// Start proxy.
Proxy.prototype.run = function() {
  this.logger.info('starting proxy on http://%s:%s/', this.options.host, this.options.port);
};

module.exports.Proxy = Proxy;
