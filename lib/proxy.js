/*jshint esnext:false */
/*jshint -W020 */

// Fuck You, Node.
require('events').EventEmitter.prototype._maxListeners = 1000;

var _           = require('lodash');
var url         = require('url');
var bunyan      = require('bunyan');
var express     = require('express');
var compression = require('compression');
var RuleLoader  = require('./rule-loader').RuleLoader;

var Proxy = function Proxy(options) {
  if (this.constructor.name !== 'Proxy') {
    return new Proxy(options);
  }
  this.options = options;

  // Initialize logger.
  var logger = this.logger = bunyan.createLogger({
    name        : 'node-rewriting-proxy',
    level       : options['log-level'],
    stream      : process.stderr,
    serializers : {
      req : bunyan.stdSerializers.req,
      err : bunyan.stdSerializers.err,
    }
  });

  // TEMPORARY
  process.on('uncaughtException', function(err) {
    require('long-stack-traces');
    logger.debug({ err : err }, 'uncaught exception');
  });

  // Load rules.
  this.rules = RuleLoader(options);
  if (! this.rules) {
    console.error('Unable to load rules, giving up...');
    process.exit(0);
  }

  // Run a rule-test?
  if (options.test) {
    this.testRule(options.test);
    process.exit(0);
  } else {
    // Start HTTP server which is going to act as a proxy.
    this.startServer(options);
  }
};

Proxy.prototype.testRule = function(url) {
  var req     = require('url').parse(url);
  var matcher = this.ruleMatchesRequest.bind(this, req);
  var matches = _.filter(this.rules.ofType('*'), matcher);

  console.log('Rule%s matching', matches.length === 1 ? '' : 's', url);
  matches.forEach(function(rule) {
    console.log(' -', rule);
  });
};

Proxy.prototype.startServer = function(options) {
  var proxy   = this;
  this.app    = express();
  this.server = this.app.listen(options.port, options.host);

  // Configure Express.
  this.app.disable('x-powered-by');
  this.app.disable('etag');

  // Use compression middleware to compress responses.
  this.app.use(compression());

  // Use Express middleware to implement filtering.
  this.app.use(
    // Find rules that match this request.
    function(req, res, next) {
      req.matchingRules = _(proxy.rules.ofType('*')).filter(function(rule) {
        return proxy.ruleMatchesRequest(req, rule);
      }).groupBy('type').value();
      return next();
    },
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
