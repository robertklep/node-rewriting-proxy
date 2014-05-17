var url   = require('url');
var mime  = require('mime');

module.exports = function(proxy) {
  return function(req, res, next) {
    var parsed    = url.parse(req.url);
    var mimetype  = mime.lookup(parsed.pathname);

    // Check if we can do anything with the mime type.
    var content;
    if (mimetype) {
      // Set content-type.
      res.setHeader('Content-Type', mimetype);

      // See if we can inject a 1x1 transparent pixel.
      switch(mimetype) {
        case 'image/png':
          content = new Buffer('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVQYV2NgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=', 'base64');
          break;
        case 'image/gif':
          content = new Buffer('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
          break;
      }
    }
    if (content) {
      res.statusCode = 200;
      return res.end(content);
    } else {
      res.statusCode = 404;
      return res.end('Not Found');
    }
  };
};
