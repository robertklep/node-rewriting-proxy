var _ = require('lodash');

module.exports = function(proxy) {
  var rejectionMiddleware = require('./reject')(proxy);

  // Return middleware handler.
  return function(req, res, next) {
    var reject  = (req.matchingRules.whitelist || []).length === 0 && (req.matchingRules.block || []).length !== 0;

    proxy.logger.trace({ req : req }, reject ? 'block' : 'pass');

    return reject ? rejectionMiddleware(req, res, next) : next();
  };
};
