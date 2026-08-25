import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

// SIDE_EFFECT_FREE_PATHS is a claim about the source, so every bundler that
// touches frontend source has to apply it, not just the main app build.
// A bundler that skips the rule keeps shipping dead barrel re-exports,
// which no build fails on — the bundle is just silently bigger.

const REPO_ROOT = path.resolve(__dirname, "../../..");

// The configs require @rspack/core, whose ESM dist jest cannot load,
// so a child node process loads them and reports the offenders.
const CHECK_RSPACK_CONFIGS = `
  const fs = require("fs");
  const path = require("path");
  const {
    SIDE_EFFECT_FREE_RULE,
  } = require("./frontend/build/shared/rspack/side-effect-free-modules");
  const files = fs
    .readdirSync(".")
    .filter((file) => /^rspack\\..*\\.config\\.js$/.test(file));
  const offenders = files.filter((file) => {
    let configs = require(path.resolve(file));
    configs = Array.isArray(configs) ? configs : [configs];
    return configs
      .map((config) =>
        typeof config === "function"
          ? config({}, { mode: "production" })
          : config,
      )
      .some((config) => !config.module.rules.includes(SIDE_EFFECT_FREE_RULE));
  });
  console.log(JSON.stringify({ files, offenders }));
`;

it("every rspack config applies SIDE_EFFECT_FREE_RULE", () => {
  const output = execFileSync("node", ["-e", CHECK_RSPACK_CONFIGS], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const { files, offenders } = JSON.parse(output.trim().split("\n").pop());
  expect(files).toContain("rspack.main.config.js");
  if (offenders.length > 0) {
    throw new Error(
      `${offenders.join(", ")}: a config this file exports is missing ` +
        `SIDE_EFFECT_FREE_RULE from module.rules. Require it from ` +
        `frontend/build/shared/rspack/side-effect-free-modules and add it.`,
    );
  }
}, 60_000);

it("the storybook webpack config applies SIDE_EFFECT_FREE_RULE", () => {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, ".storybook/main.ts"),
    "utf8",
  );
  expect(source).toContain("SIDE_EFFECT_FREE_RULE");
});

it("the cypress esbuild preprocessor applies the side-effect-free plugin", () => {
  // The preprocessor's plugin list only exists inside setupNodeEvents,
  // and calling that builds fixtures and registers tasks, so check the source instead.
  const source = fs.readFileSync(
    path.join(REPO_ROOT, "e2e/support/config.js"),
    "utf8",
  );
  expect(source).toContain("sideEffectFreeModulesPlugin");
});
