import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { ESLint } from "eslint";

import { createConfig, root, settingsForFile } from "../oxlint/config.mjs";
import defaults from "../oxlint/rule-defaults.json" with { type: "json" };
import presets from "../recommended-rules.json" with { type: "json" };
import {
  recommendedRules,
  ruleDefaults,
} from "../update-recommended-rules.mjs";

test("preset and default snapshots match installed plugin versions", () => {
  assert.deepEqual(presets, recommendedRules, "Run bun run lint-config-update");
  assert.deepEqual(defaults, ruleDefaults, "Run bun run lint-config-update");
});

test("JS plugin settings match ESLint for existing and newly added paths", async () => {
  const eslint = new ESLint({ cwd: root });
  for (const relative of [
    "frontend/src/metabase/new-module/Example.tsx",
    "frontend/src/metabase/new-module/Example.unit.spec.tsx",
    "frontend/src/metabase/new-module/Example.stories.tsx",
    "frontend/src/metabase/new-module/Example.js",
    "frontend/lint/oxlint/config.mjs",
    "enterprise/frontend/src/metabase-enterprise/new-module/Example.tsx",
    "enterprise/frontend/src/embedding-sdk-ee/new-module/Example.unit.spec.tsx",
    "e2e/test/scenarios/new-module/example.cy.spec.ts",
    "e2e/test-component/scenarios/new-module/example.cy.spec.tsx",
    "e2e/support/new-module/helper.ts",
    "frontend/test/new-module/setup.ts",
  ]) {
    const filename = path.join(root, relative);
    const expected = await eslint.calculateConfigForFile(filename);
    const actual = settingsForFile(filename);
    assert.deepEqual(
      actual.settings,
      expected.settings ?? {},
      `${relative}: settings`,
    );
    // ESLint supplies these language defaults outside parserOptions; oxlint
    // likewise supplies them on its own context/sourceCode object.
    const parserOptions = { ...expected.languageOptions.parserOptions };
    const actualParserOptions = { ...actual.parserOptions };
    delete parserOptions.sourceType;
    delete actualParserOptions.sourceType;
    assert.deepEqual(
      actualParserOptions,
      parserOptions,
      `${relative}: parser options`,
    );
  }
});

test("native overrides retain inherited prefer-const and console options", () => {
  const config = createConfig();
  const ts = config.overrides.filter((entry) =>
    entry.files.includes("**/*.ts"),
  );
  const preference = ts.findLast((entry) => entry.rules["prefer-const"]);
  assert.equal(preference.rules["prefer-const"][1].destructuring, "all");
  const e2e = config.overrides.find((entry) =>
    entry.files.includes("e2e/**/*.cy.spec.*"),
  );
  assert.deepEqual(e2e.rules["no-console"][1].allow, [
    "warn",
    "error",
    "errorBuffer",
  ]);
});

test("TS base-rule disables do not overwrite native extension rules", () => {
  const config = createConfig();
  const ts = config.overrides.findLast(
    (entry) => entry.files.includes("**/*.ts") && entry.rules["no-unused-vars"],
  );
  assert.equal(ts.rules["no-unused-vars"][0], "error");
  assert.equal(ts.rules["no-unused-vars"][1].varsIgnorePattern, "^_.+$");
});
