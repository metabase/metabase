const fs = require("fs");
const path = require("path");

// Keeps only the spec files listed in the JSON array at JEST_TEST_PATHS_FILE.
// Jest 30 expects the kept paths themselves here, not the { test } objects its docs show.
module.exports = (testPaths) => {
  const listed = JSON.parse(
    fs.readFileSync(process.env.JEST_TEST_PATHS_FILE, "utf8"),
  );
  const keep = new Set(listed.map((p) => path.resolve(p)));
  return { filtered: testPaths.filter((p) => keep.has(p)) };
};
