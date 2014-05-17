/* jshint esnext: false */
var fs      = require('fs');
var path    = require('path');
var _       = require('lodash');
var bunyan  = require('bunyan');
var hoxy    = require('hoxy');
var xpath   = require('xpath');
var xmldom  = require('xmldom');

var AdBlockProxy = function AdBlockProxy(options) {
  if (this.constructor.name !== 'AdBlockProxy') {
    return new AdBlockProxy(options);
  }
  this.options = options;

  // Initialize logger.
  this.logger = bunyan.createLogger({
    name  : 'node-ad-blocker',
    level : options['log-level']
  });

  // Initialize proxy.
  this.proxy = new hoxy.Proxy();

  // Initialize rule set.
  this.rulesPath  = options['rule-dir'];
  this.rulesFiles = [];
  this.rules      = [];
  this.initializeRules();
};

AdBlockProxy.prototype.initializeRules = function(reload) {
  var adblockproxy = this;

  // Find configuration files.
  try {
    adblockproxy.rulesFiles = fs.readdirSync(this.rulesPath).filter(function(file) {
      return /\.xml$/i.test(file);
    }).map(function(file) {
      return path.normalize(adblockproxy.rulesPath + '/' + file);
    });
  } catch(err) {
    console.error('Fatal error reading rules directory: %s', err.message);
    process.exit(1);
  }

  // Watch rules directory for changes.
  if (! reload) {
    fs.watch(this.rulesPath, function(ev, filename) {
      if (ev !== 'change') {
        return;
      }
      adblockproxy.logger.info("file '%s' changed, reloading configuration", filename);
      adblockproxy.initializeRules(true);
    });
  }

  // Check if we have any files to read.
  if (this.rulesFiles.length === 0) {
    console.error('Not found any rules files, giving up.');
    process.exit(1);
  }

  // Load each rule file and process it.
  this.rulesFiles.forEach(this.loadRuleFile.bind(this));

  // Check if we have read any rules.
  if (this.rules.length === 0) {
    console.error('Not found any rules, giving up.');
    process.exit(1);
  }

  // Log some info.
  this.logger.info({
    ruleCount : this.rules.length,
    fileCount : this.rulesFiles.length,
  }, 'rules loaded');

  // Sort rules on priority.
  this.rules = _.sortBy(this.rules, 'priority');

  // Process rules.
  this.processRules();
};

AdBlockProxy.prototype.loadRuleFile = function(file) {
  var adblockproxy  = this;
  var xml           = fs.readFileSync(file).toString();
  var parser        = new xmldom.DOMParser({
    errorHandler : function(err) {
      adblockproxy.logger.error({ err : err }, 'xml parser error');
    }
  });

  // Try parsing the XML document.
  var doc = parser.parseFromString(xml);
  if (! doc) {
    return;
  }

  // Find <rule> nodes.
  xpath.select("//rule", doc).forEach(function(rule) {
    var ruleType  = rule.getAttribute('type');
    var host      = rule.getAttribute('host');
    var hostType  = rule.getAttribute('host-type');
    var path      = rule.getAttribute('path');
    var pathType  = rule.getAttribute('path-type');
    var newRule   = {};

    // Process host types.
    if (host) {
      switch (hostType) {
        case 'is':
          host = RegExp('^' + RegExp.escape(host) + '$');
          break;
        case 'domain':
          host = RegExp(RegExp.escape(host) + '$');
          break;
        case 'regexp':
          host = RegExp(host);
          break;
        default       :
          adblockproxy.logger.warn({ type : hostType }, 'unknown host-type');
          break;
      }
      newRule.host = host;
    }

    // Process path types.
    if (path) {
      switch (pathType) {
        case 'contains':
          path = RegExp(RegExp.escape(path));
          break;
        case 'starts-with':
          path = RegExp('^' + RegExp.escape(path));
          break;
        case 'ends-with':
          path = RegExp(RegExp.escape(path) + '$');
          break;
        case 'is':
          path = RegExp('^' + RegExp.escape(path) + '$');
          break;
        case 'regexp':
          path = RegExp(path);
          break;
        default       :
          adblockproxy.logger.warn({ type : pathType }, 'unknown path-type');
          break;
      }
      newRule.path = path;
    }

    // Process modify rules.
    if (ruleType === 'modify') {
      var validRule = false;
      [ 'css', 'js' ].forEach(function(type) {
        var node = xpath.select1('./' + type, rule);
        if (node) {
          newRule[type] = newRule[type] || [];
          newRule[type].push({
            type      : type,
            placement : node.getAttribute('placement') || 'head-end',
            content   : node.firstChild.nodeValue,
          });
          validRule = true;
        }
      });
      if (! validRule) {
        return;
      }
    }

    // Copy some properties over.
    newRule.type      = ruleType;
    newRule.priority  = Number(rule.getAttribute('priority') || 0);

    // Push rule onto list.
    adblockproxy.rules.push(newRule);
  });
};

AdBlockProxy.prototype.processRules = function() {
  this.processBlockRules();
  this.processModifyRules();
};

// Process 'block' and 'whitelist' rules.
AdBlockProxy.prototype.processBlockRules = function() {
  var adblockproxy    = this;
  var whiteListRules  = _.where(this.rules, { type : 'whitelist' });

  _.where(this.rules, { type : 'block' }).forEach(function(rule) {
    var options = { phase : 'request' };
    if (rule.host) options.host  = rule.host;
    if (rule.path) options.url   = rule.path;

    // Do we need to apply a whitelist filter?
    if (whiteListRules.length) {
      options.filter = function(req, res) {
        return ! lodash.some(whiteListRules, function(wlrule) {
          if (wlrule.host && wlrule.host.test(req.hostname)) {
            return true;
          }
          if (wlrule.path && wlrule.path.test(req.url)) {
            return true;
          }
          return false;
        });
      };
    }

    // Intercept the request.
    adblockproxy.proxy.intercept(options, function(req, res) {
      adblockproxy.logger.trace({ req : req }, 'block');
      res.statusCode = 404;
    });
  });
};

// Process 'modify' rules.
AdBlockProxy.prototype.processModifyRules = function() {
  var adblockproxy = this;

  _.where(this.rules, { type : 'modify' }).forEach(function(rule) {
    var options = { phase : 'response', as : '$' };
    if (rule.host) options.host  = rule.host;
    if (rule.path) options.url   = rule.path;

    adblockproxy.proxy.intercept(options, function(req, res) {
      adblockproxy.logger.trace({ req : req }, 'modify');
      [ 'js', 'css' ].forEach(function(type) {
        (rule[type] || []).forEach(function(mod) {
          // Cached?
          if (! mod._cached) {
            mod._cached =   '<!-- node-ad-block:' + type + ' -->\n';
            mod._cached +=  (type === 'js' ? '<script>' : '<style>') + '\n';
            mod._cached +=  '\n' + mod.content + '\n';
            mod._cached +=  (type === 'js' ? '</script>' : '</style>') + '\n';
          }
          var content = mod._cached;
          switch(mod.placement) {
            case 'body-start' : res.$('body').prepend(content); break;
            case 'body-end'   : res.$('body').append(content) ; break;
            case 'head-start' : res.$('head').prepend(content); break;
            case 'head-end'   : res.$('head').append(content) ; break;
          }
        });
      });
    });
  });
};

// Start ad block proxy.
AdBlockProxy.prototype.run = function() {
  this.logger.info('starting proxy on http://%s:%s/', this.options.host, this.options.port);
  // XXX: hoxy doesn't allow us to check if the bind went okay...
  this.proxy.listen(this.options.port, this.options.host);
};

module.exports.AdBlockProxy = AdBlockProxy;
