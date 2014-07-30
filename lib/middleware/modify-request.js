var _   = require('lodash');
var vm  = require('vm');

module.exports = function(proxy) {
  var rules = proxy.rules.ofType('request');
  return function(req, res, next) {
    // Run request modification rules.
    _.filter(rules, proxy.ruleMatchesRequest.bind(proxy, req)).forEach(function(rule, i) {
      if (i === 0) {
        proxy.logger.trace({ req : req, rule : rule }, 'request');
      }
      modifyRequest(proxy, rule, req, res);
    });
    // Pass long, unless the response has finished.
    if (! res.finished) {
      next();
    }
  };
};

function modifyRequest(proxy, rule, req, res) {
  var sandbox = {
    console   : console,
    request   : req,
    response  : res,
    gb        : {
      request   : req,
      response  : res,
      log       : console.log.bind(console)
    }
  };
  try {
    vm.runInNewContext(rule.handler, sandbox, rule.id);
  } catch(err) {
    proxy.logger.error(err, 'request execution error');
  }
}
