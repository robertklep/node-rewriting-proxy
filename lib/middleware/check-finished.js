module.exports = function(proxy) {
  return function(req, res, next) {
    if (! res.finished) {
      next();
    }
  };
};
