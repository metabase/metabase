/*eslint-env node */

import path from "path";
import fs from "fs";

let normalizedPath = path.join(__dirname, "..", "..", "components");

export default fs
  .readdirSync(normalizedPath)
  .filter(file => /\.info\.js$/.test(file))
  .map(file => require(path.join(normalizedPath, file)));
