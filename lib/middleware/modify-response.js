var _     = require('lodash');
var vm    = require('vm');
var zlib  = require('zlib');
var http  = require('http');
var url   = require('url');

// XXX: configure this?
http.globalAgent.maxSockets = 100;

module.exports = function(proxy) {
  var rules = proxy.rules.ofType('modify');
  return function(req, res, next) {
    var matcher = proxy.ruleMatchesRequest.bind(proxy, req);

    // Check if we have any rules that match this request.
    if (_.some(rules, matcher)) {
      // Yes: perform request ourselves.
      proxy.logger.trace({ req : req }, 'modify');
      var parsedUrl = url.parse(req.url);
      req.pipe(http.request({
        hostname  : parsedUrl.hostname,
        port      : ~~parsedUrl.port || 80,
        path      : parsedUrl.path + (parsedUrl.hash || ''),
        method    : req.method,
        headers   : req.headers
      }, function(httpResponse) {
        // Don't propagate Connection header.
        delete httpResponse.headers.connection;

        // Short-circuit this request when it's obvious we're not going to need
        // to modify it.
        if (
            httpResponse.statusCode >= 300 ||
            (httpResponse.headers['content-type'] || '').indexOf('text/html') === -1
        ) {
          res.writeHead(httpResponse.statusCode, httpResponse.headers);
          return httpResponse.pipe(res);
        }

        // Process modification rules.
        var doModify = function(err, body) {
          // Handle decompression errors.
          if (err) {
            proxy.logger.error({
              req : req,
              err : err
            }, 'decompression error');
            return res.status(500);
          }

          // Delete compression headers (will confuse Express' compression middleware).
          delete httpResponse.headers['transfer-encoding'];
          delete httpResponse.headers['content-encoding'];
          delete httpResponse.headers['content-length'];

          // Run modification rules.
          body = body.toString();
          _.filter(rules, matcher).forEach(function(rule) {
            body = modifyResponse(proxy, rule, req, res, httpResponse.headers, body);
          });

          // If the rules haven't finished the response already, send it.
          if (! res.finished) {
            // Copy response headers to our own response.
            res.set(httpResponse.headers);
            // Send body.
            res.status(httpResponse.statusCode).end(body);
          }
        };

        // Buffer entire response.
        var chunks = [];
        httpResponse.on('data', function(chunk) {
          chunks.push(chunk);
        }).on('end', function() {
          var body = Buffer.concat(chunks);
          // Check for compressed data.
          switch(httpResponse.headers['content-encoding']) {
            case 'gzip'   : zlib.gunzip(body,   doModify)   ; break;
            case 'deflate': zlib.inflate(body,  doModify)   ; break;
            default       : doModify(null, body.toString()) ; break;
          }
        }).on('error', function(err) {
          proxy.logger.error({
            req : req,
            err : err
          }, 'http response error');
          return res.status(500);
        });
      }));
    } else {
      // No: pass to next middleware (proxy-middleware).
      next();
    }
  };
};

function modifyResponse(proxy, rule, req, res, headers, body) {
  // Log a trace message.
  proxy.logger.trace({ req : req }, 'modify');

  // Perform modification.
  [ 'js', 'css', 'transform' ].forEach(function(type) {
    (rule[type] || []).forEach(function(mod) {
      if (type === 'js' || type === 'css') {
        // Cached?
        if (! mod._cached) {
          mod._cached =   '\n<!-- node-rewriting-proxy:' + type + ' -->\n';
          mod._cached +=  (type === 'js' ? '<script>' : '<style>') + '\n';
          mod._cached +=  '\n' + mod.content + '\n';
          mod._cached +=  (type === 'js' ? '</script>' : '</style>') + '\n';
        }
        var content = mod._cached;
        switch(mod.placement) {
          case 'body-start' : body = body.replace(/<\s*body.*?>/i, '$&' + content)      ; break;
          case 'body-end'   : body = body.replace(/<\s*\/\s*body.*?>/i, content + '$&') ; break;
          case 'head-start' : body = body.replace(/<\s*head.*?>/i, '$&' + content)      ; break;
          case 'head-end'   : body = body.replace(/<\s*\/\s*head.*?>/i, content + '$&') ; break;
        }
      } else if (type === 'transform') {
        body = transformResponse(proxy, mod, req, res, headers, body);
      }
    });
  });
  return body;
}

function transformResponse(proxy, rule, req, res, headers, body) {
  var code    = rule.content;
  var sandbox = {
    console   : console,
    request   : req,
    response  : res,
    html      : body,
    body      : body,
    headers   : headers,
    gb        : {
      request           : req,
      response          : res,
      insertAtHeadStart : function(html) {
        body = body.replace(/<head.*?>/i, function(match) {
          return match + html;
        });
      }
    },
    replace   : function(from, to) {
      body = body.replace(from, to);
      return body;
    }
  };
  try {
    vm.runInNewContext(code, sandbox, rule.id);
  } catch(err) {
    proxy.logger.error({ err : err }, 'transform execution error');
  }
  return body;
}
