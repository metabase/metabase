/* eslint-disable @typescript-eslint/no-require-imports -- Jest requires this module as a CommonJS function. */
const fs = require("node:fs");
const path = require("node:path");

// Jest requires the filter directly, without transforms or default-export interop.
// CI's Node version strips the TypeScript annotations when loading this file.
module.exports = (testPaths: string[]) => {
  const listed: string[] = JSON.parse(
    fs.readFileSync(process.env.JEST_TEST_PATHS_FILE, "utf8"),
  );
  const keep = new Set(listed.map((p) => path.resolve(p)));
  return { filtered: testPaths.filter((p) => keep.has(p)) };
};
