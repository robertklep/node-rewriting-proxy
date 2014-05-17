var _ = require('lodash');

module.exports = function(proxy) {
  var rejectionMiddleware = require('./reject')(proxy);

  // Find block and whitelist rules.
  var blockRules          = proxy.rules.ofType('block');
  var whiteListRules      = proxy.rules.ofType('whitelist');

  // Return middleware handler.
  return function(req, res, next) {
    var matcher = proxy.ruleMatchesRequest.bind(proxy, req);
    var reject  = ! _.some(whiteListRules, matcher) && _.some(blockRules, matcher);

    proxy.logger.trace({ req : req }, reject ? 'block' : 'pass');

    return reject ? rejectionMiddleware(req, res, next) : next();
  };
};
