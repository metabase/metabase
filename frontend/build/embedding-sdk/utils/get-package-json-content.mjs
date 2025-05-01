import fs from "fs";
import path from "path";

import { ROOT_PATH } from "../constants/paths.mjs";

export function getPackageJsonContent(packagePath = ROOT_PATH) {
  try {
    const mainPackageJson = fs.readFileSync(
      path.resolve(path.join(packagePath, "./package.json")),
      "utf-8",
    );

    return JSON.parse(mainPackageJson);
  } catch {
    return null;
  }
}
