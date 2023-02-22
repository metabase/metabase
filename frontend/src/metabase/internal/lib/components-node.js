/*eslint-env node */

import fs from "fs";
import path from "path";

const normalizedPath = path.join(__dirname, "..", "..", "components");

export default fs
  .readdirSync(normalizedPath)
  .filter(file => /\.info\.js$/.test(file))
  .map(file => ({
    filename: file.replace(/\.info\.js$/, ""),
    ...require(path.join(normalizedPath, file)),
  }));
