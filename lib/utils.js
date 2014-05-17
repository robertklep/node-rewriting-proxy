RegExp.escape = function(str) {
  return String(str).replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
};

RegExp.fromString = function(str) {
  return RegExp(RegExp.escape(str));
};

module.exports = {};
