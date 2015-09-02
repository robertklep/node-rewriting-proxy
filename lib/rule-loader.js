var _        = require('lodash');
var fs       = require('fs');
var path     = require('path');
var xpath    = require('xpath');
var xmldom   = require('xmldom');
var bunyan   = require('bunyan');
var chokidar = require('chokidar');

var RuleLoader = module.exports.RuleLoader = function RuleLoader(options) {
  if (this.constructor.name !== 'RuleLoader') {
    return new RuleLoader(options);
  }
  this.options = options;
  // Initialize logger.
  this.logger = bunyan.createLogger({
    name    : 'node-rewriting-proxy#rule-loader',
    level   : options['log-level'],
    stream  : process.stderr,
  });
  // Initialize rules.
  return this.initializeRules();
};

RuleLoader.prototype.initializeRules = function() {
  var loader  = this;
  var dir     = this.options['rule-dir'];

  // Reset existing rules.
  loader.rules = [];

  // Find configuration files.
  try {
    loader.rulesFiles = fs.readdirSync(dir).filter(function(file) {
      return /\.xml$/i.test(file);
    }).map(function(file) {
      return path.normalize(dir + '/' + file);
    });
  } catch(err) {
    loader.logger.warn({ err : err }, 'Fatal error reading rules directory');
    return false;
  }

  // Watch rules directory for changes.
  if (! this.watching) {
    this.watching = true;
    chokidar.watch(dir).on('change', function(path) {
      loader.logger.info("File '%s' changed, reloading configuration", path);
      loader.initializeRules();
    });
  }

  // Check if we have any files to read.
  if (loader.rulesFiles.length === 0) {
    loader.logger.warn('Didn\'t find any rules files.');
    return false;
  }

  // Load each rule file and process it.
  loader.rulesFiles.forEach(loader.loadRuleFile.bind(loader));

  // Check if we have read any rules.
  if (loader.rules.length === 0) {
    loader.logger.warn('Didn\'t find any rules.');
    return false;
  }

  // Log some info.
  loader.logger.info({
    ruleCount : loader.rules.length,
    fileCount : loader.rulesFiles.length,
  }, 'Rules loaded.');

  // Reverse-sort rules on priority (highest priority first).
  loader.rules = _.sortBy(loader.rules, 'priority').reverse();

  // Done
  return true;
};

RuleLoader.prototype.loadRuleFile = function(file) {
  var loader  = this;
  var xml     = fs.readFileSync(file).toString();
  var parser  = new xmldom.DOMParser({
    errorHandler : function(err) {
      loader.logger.error({ err : err }, 'XML parser error.');
    }
  });

  // Try parsing the XML document.
  var doc = parser.parseFromString(xml);
  if (! doc) {
    return;
  }

  // Find <rule> nodes.
  xpath.select("//rule", doc).forEach(function(rule) {
    var ruleId    = rule.getAttribute('rule-id') || 'file-' + loader.rules.length;
    var ruleType  = rule.getAttribute('type');
    var host      = rule.getAttribute('host');
    var hostType  = rule.getAttribute('host-type');
    var path      = rule.getAttribute('path');
    var pathType  = rule.getAttribute('path-type');
    var disabled  = rule.getAttribute('disabled');
    var newRule   = { id : ruleId };

    // Skip disabled rules or rules without a type
    if (disabled === '1' || (ruleType || '').length === 0) {
      return;
    }

    // Skip 'keyword' rules.
    if (ruleType === 'keyword') {
      return;
    }

    // Process host types.
    if (host) {
      switch (hostType) {
        case 'is':
          newRule.host = RegExp('^' + RegExp.escape(host) + '$');
          break;
        case 'domain':
          newRule.host = RegExp(RegExp.escape(host) + '$');
          break;
        case 'regexp':
          newRule.host = RegExp(host);
          break;
        default:
          loader.logger.warn({ type : hostType }, 'unknown host-type');
          break;
      }
    }

    // Process path types.
    if (path) {
      switch (pathType) {
        case 'contains':
          newRule.path = RegExp(RegExp.escape(path));
          break;
        case 'starts-with':
          newRule.path = RegExp('^' + RegExp.escape(path));
          break;
        case 'ends-with':
          newRule.path = RegExp(RegExp.escape(path) + '$');
          break;
        case 'is':
          newRule.path = RegExp('^' + RegExp.escape(path) + '$');
          break;
        case 'regexp':
          newRule.path = RegExp(path);
          break;
        default:
          loader.logger.warn({ type : pathType }, 'unknown path-type');
          break;
      }
    }

    // Process modify rules.
    var validRule = false;
    if (ruleType === 'modify') {
      [ 'css', 'js', 'transform' ].forEach(function(type) {
        var nodes = xpath.select('./' + type, rule);
        nodes.forEach(function(node) {
          newRule[type] = newRule[type] || [];
          newRule[type].push({
            type      : type,
            placement : node.getAttribute('placement') || 'head-end', // not used for `transform` rules.
            content   : node.firstChild.nodeValue,
          });
          validRule = true;
        });
      });
      if (! validRule) {
        return;
      }
    }
    // Process request rules.
    else if (ruleType === 'request') {
      xpath.select('./request[@language="js"]', rule).forEach(function(node) {
        newRule.handler = node.firstChild.nodeValue;
        validRule = true;
      });
      if (! validRule) {
        return;
      }
    }

    // Copy some properties over.
    newRule.type      = ruleType;
    newRule.priority  = Number(rule.getAttribute('priority') || 0);

    // Push rule onto list.
    loader.rules.push(newRule);
  });
};

RuleLoader.prototype.ofType = function(type) {
  if (type === 'all' || type === '*') {
    return this.rules;
  }
  return _.where(this.rules, { type : type });
};
