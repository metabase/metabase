const { execFileSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "../../..");
const RUNNER = path.join(__dirname, "lint-text-with-config.mjs");

const CONFIG_FILES = [
  "eslint.config.mjs",
  "eslint.config.module-boundaries.mjs",
];

// A file in lib/utils, the bottom tier, so a dependency on any shared module is forbidden.
const LIB_FILE = path.join(
  REPO_ROOT,
  "frontend/src/metabase/utils/module-boundaries-export-nodes.ts",
);

const FORBIDDEN_VALUES = "metabase/embedding-sdk/config";
const FORBIDDEN_TYPES = "metabase/embedding-sdk/theme";
const ALLOWED_TYPES = "metabase-types/api";

const CASES = [
  {
    name: "reports a named re-export from a higher module",
    code: `export { isEmbeddingSdk } from "${FORBIDDEN_VALUES}";`,
    violations: 1,
  },
  {
    name: "reports a star re-export from a higher module",
    code: `export * from "${FORBIDDEN_VALUES}";`,
    violations: 1,
  },
  {
    name: "reports a namespace re-export from a higher module",
    code: `export * as sdkConfig from "${FORBIDDEN_VALUES}";`,
    violations: 1,
  },
  {
    name: "reports a declaration-level type re-export from a higher module",
    code: `export type { MetabaseTheme } from "${FORBIDDEN_TYPES}";`,
    violations: 1,
  },
  {
    name: "reports an inline type re-export from a higher module",
    code: `export { type MetabaseTheme } from "${FORBIDDEN_TYPES}";`,
    violations: 1,
  },
  {
    name: "reports a re-export mixing a type and a value from a higher module",
    code: `export { defineMetabaseTheme, type MetabaseTheme } from "${FORBIDDEN_TYPES}";`,
    violations: 1,
  },
  {
    name: "reports every re-export in a file with two of them",
    code: [
      `export { isEmbeddingSdk } from "${FORBIDDEN_VALUES}";`,
      `export type { MetabaseTheme } from "${FORBIDDEN_TYPES}";`,
    ].join("\n"),
    violations: 2,
  },
  {
    name: "allows a re-export from a lower module",
    code: `export type { CardId } from "${ALLOWED_TYPES}";`,
    violations: 0,
  },
  {
    name: "allows a local export with no source module",
    code: ["const noop = () => undefined;", "export { noop };"].join("\n"),
    violations: 0,
  },
];

function lintCases(configFile) {
  const payload = JSON.stringify({
    configFile: path.join(REPO_ROOT, configFile),
    cases: CASES.map(({ code }) => ({ code, filePath: LIB_FILE })),
  });
  const stdout = execFileSync(process.execPath, [RUNNER], {
    cwd: REPO_ROOT,
    input: payload,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout).map((messages) =>
    messages
      .filter((message) => message.ruleId === "boundaries/element-types")
      .map((message) => message.message),
  );
}

describe.each(CONFIG_FILES)("boundaries/element-types via %s", (configFile) => {
  let byCase;

  beforeAll(() => {
    byCase = lintCases(configFile);
  }, 300000);

  test.each(CASES.map((testCase, index) => [testCase.name, index]))(
    "%s",
    (_name, index) => {
      const { violations } = CASES[index];
      expect(byCase[index]).toEqual(
        Array(violations).fill(expect.stringContaining("shared/embedding-sdk")),
      );
    },
  );
});
