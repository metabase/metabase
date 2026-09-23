const fs = require("node:fs");
const path = require("node:path");

// Jest requires the filter directly, without transforms or default-export interop.
/** @param {string[]} testPaths */
module.exports = (testPaths) => {
  const listed = JSON.parse(
    fs.readFileSync(process.env.JEST_TEST_PATHS_FILE, "utf8"),
  );
  const keep = new Set(listed.map((p) => path.resolve(p)));
  return { filtered: testPaths.filter((p) => keep.has(p)) };
};
