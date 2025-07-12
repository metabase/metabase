import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { SDK_SRC_PATH } from "./paths.mjs";

const pkgTpl = fs.readFileSync(
  path.resolve(SDK_SRC_PATH, "package.template.json"),
  "utf-8",
);

export const EMBEDDING_SDK_VERSION = JSON.parse(pkgTpl).version;

export const GIT_BRANCH = execSync("git rev-parse --abbrev-ref HEAD")
  .toString()
  .trim();

export const GIT_COMMIT = execSync("git rev-parse HEAD").toString().trim();
