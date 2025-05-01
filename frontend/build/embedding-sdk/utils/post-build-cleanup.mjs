import fs from "fs";
import path from "path";

import { ENABLE_SOURCE_MAPS } from "../constants/source-maps-enabled.mjs";

export const postBuildCleanup = ({ buildPath }) => {
  fs.rmSync(path.join(buildPath, "index.css"), { force: true });

  if (ENABLE_SOURCE_MAPS) {
    fs.rmSync(path.join(buildPath, "index.css.map"), { force: true });
  }
};
