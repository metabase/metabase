import { execFileSync } from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const PACKAGE_PATH = path.resolve("resources/embedding-sdk");

const SMOKE_TEST_PATH = fs.mkdtempSync(
  path.join(os.tmpdir(), "sdk-package-smoke-"),
);

const NPM_COMMAND_OPTIONS = {
  cwd: SMOKE_TEST_PATH,
  encoding: "utf8",
  timeout: 180_000,
  env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" },
};

try {
  fs.writeFileSync(
    path.join(SMOKE_TEST_PATH, "package.json"),
    JSON.stringify({ name: "sdk-package-smoke-test", private: true }),
  );

  // Get tarball with the SDK package dependencies
  const [tarball] = JSON.parse(
    execFileSync(
      "npm",
      ["pack", PACKAGE_PATH, "--json", "--ignore-scripts"],
      NPM_COMMAND_OPTIONS,
    ),
  );

  // Install the packed sdk and runtime dependencies
  execFileSync(
    "npm",
    [
      "install",
      tarball.filename,
      "--legacy-peer-deps",
      "--no-audit",
      "--no-fund",
    ],
    NPM_COMMAND_OPTIONS,
  );

  const installedPackage = path.join(
    SMOKE_TEST_PATH,
    "node_modules/@metabase/embedding-sdk-react",
  );

  // Check that both esbuild and typescript modules are installed and can be used
  execFileSync(
    process.execPath,
    [
      "--eval",
      `
        const { createRequire } = require("node:module");
        const sdkRequire = createRequire(${JSON.stringify(path.join(installedPackage, "package.json"))});

        sdkRequire("esbuild").transformSync("const value: number = 1", { loader: "ts" });
        sdkRequire("typescript").transpileModule("const value: number = 1", {});
      `,
    ],
    NPM_COMMAND_OPTIONS,
  );

  console.log("SDK package smoke test passed.");
} finally {
  fs.rmSync(SMOKE_TEST_PATH, { recursive: true, force: true });
}
