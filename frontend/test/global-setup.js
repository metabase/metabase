// A quirk of the way the tests are loaded causes a double-inclusion warning from Closure's goog.isProvided_ check.
// It's actually harmless, just an overzealous dev-mode warning, so we monkey-patch goog.isProvided_ to return false.
module.exports = function () {
  const fs = require("fs");
  const path = require("path");
  const cljs_env = path.join(__dirname, "..", "src", "cljs", "cljs_env.js");
  const contents = fs.readFileSync(cljs_env, { encoding: "utf8" });
  const replaced = contents.replace(
    new RegExp("goog.isProvided_ = function\\(name\\) {\\n.*?\\n\\s*};"),
    "goog.isProvided_ = function(name) { return false; };",
  );
  fs.writeFileSync(cljs_env, replaced);
};
