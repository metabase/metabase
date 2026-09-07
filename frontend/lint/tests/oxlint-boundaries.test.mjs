import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { elements, enforcedRules } from "../module-boundaries.mjs";
import {
  createBoundaryChecker,
  createBoundaryPlugin,
} from "../oxlint-boundaries.mjs";

const require = createRequire(import.meta.url);
const rootPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const checker = createBoundaryChecker({
  elements,
  rules: enforcedRules,
  rootPath,
});

test("preserves full-mode priority, ordered folder matches, and dot directories", () => {
  const examples = [
    ["frontend/src/metabase/static-viz/index.tsx", "app/misc"],
    ["frontend/src/metabase/static-viz/other.tsx", "shared/static-viz"],
    ["frontend/src/metabase-lib/v1/metadata/Field.ts", "basic/mlv1"],
    ["frontend/src/metabase-lib/query.ts", "lib/mlv2"],
    ["frontend/src/embedding-sdk-shared/.storybook/preview.tsx", "app/misc"],
    ["frontend/src/metabase/env.ts", "lib/env"],
    ["frontend/src/metabase/unknown-module/file.ts", null],
    ["frontend/src/metabase/dayjs/.hidden/file.ts", null],
  ];
  for (const [filename, type] of examples) {
    assert.equal(
      checker.classify(path.join(rootPath, filename)).type,
      type,
      filename,
    );
  }
  assert.equal(
    checker.classify(path.join(rootPath, "e2e/fixture.ts")).isIgnored,
    true,
  );
});

test("matches the upstream policy evaluator for every declared module pair", (t) => {
  const pluginRoot = path.dirname(require.resolve("eslint-plugin-boundaries"));
  const { getSettings } = require(
    path.join(pluginRoot, "Settings/Validations.js"),
  );
  const { elementRulesAllowDependency } = require(
    path.join(pluginRoot, "Rules/ElementTypes.js"),
  );
  const settings = getSettings({
    settings: {
      "boundaries/elements": elements,
      "boundaries/root-path": rootPath,
      "boundaries/ignore": ["**/e2e/**", "test/**"],
    },
  });
  const options = {
    default: "disallow",
    rules: enforcedRules,
    message: "${file.type} cannot import from ${dependency.type}",
  };
  const element = (type) => ({
    type,
    origin: "local",
    category: null,
    captured: {},
    path: `${type}/file.ts`,
    elementPath: type,
    internalPath: "file.ts",
    parents: [],
    isIgnored: false,
    isUnknown: false,
  });
  let comparisons = 0;
  for (const from of checker.types) {
    for (const to of checker.types) {
      const dependency = {
        from: element(from),
        to: { ...element(to), source: to },
        dependency: {
          kind: "value",
          nodeKind: "import",
          relationship: { from: null, to: null },
          specifiers: [],
        },
      };
      const expected = elementRulesAllowDependency(
        dependency,
        settings,
        options,
      );
      assert.equal(
        checker.decision(from, to).allowed,
        expected.result,
        `${from} -> ${to}`,
      );
      comparisons++;
    }
  }
  t.diagnostic(
    `${comparisons} module pairs checked against the upstream evaluator`,
  );
});

test("preserves shared-tier restrictions and transitional exceptions", () => {
  assert.equal(
    checker.decision("shared/current-user", "shared/metadata-store").allowed,
    false,
  );
  assert.equal(
    checker.decision("shared/metadata-store", "shared/current-user").allowed,
    true,
  );
  assert.equal(checker.decision("shared/nav", "shared/palette").allowed, true);
  assert.equal(checker.decision("shared/palette", "shared/nav").allowed, true);
  assert.equal(
    checker.decision("lib/dayjs", "feature/query_builder").allowed,
    false,
  );
  for (const type of checker.types) {
    assert.equal(checker.decision(type, type).allowed, true, type);
  }
});

function elementTypes(from, to) {
  const reports = [];
  const plugin = createBoundaryPlugin({
    resolve: () => path.join(rootPath, to),
  });
  const visitor = plugin.rules["element-types"].create({
    filename: path.join(rootPath, from),
    options: [],
    report: (report) => reports.push(report),
  });
  return { visitor, reports };
}

test("element-types checks both import forms and ignores non-string sources", () => {
  const from = "frontend/src/metabase/dayjs/index.ts";
  const to = "frontend/src/metabase/query_builder/index.ts";
  const source = { type: "Literal", value: "metabase/query_builder" };
  const message = "lib/dayjs cannot import from feature/query_builder";

  const statik = elementTypes(from, to);
  statik.visitor.ImportDeclaration({ source });
  assert.deepEqual(statik.reports, [{ node: source, message }]);

  const dynamic = elementTypes(from, to);
  dynamic.visitor.ImportExpression({ source, options: null });
  assert.deepEqual(dynamic.reports, [{ node: source, message }]);

  const attributes = elementTypes(from, to);
  attributes.visitor.ImportExpression({
    source,
    options: { type: "ObjectExpression", properties: [] },
  });
  assert.deepEqual(attributes.reports, [{ node: source, message }]);

  const stringOptions = elementTypes(from, to);
  const options = { type: "Literal", value: "metabase/query_builder" };
  stringOptions.visitor.ImportExpression({ source, options });
  assert.deepEqual(stringOptions.reports, [
    { node: source, message },
    { node: options, message },
  ]);

  const template = elementTypes(from, to);
  template.visitor.ImportExpression({
    source: { type: "TemplateLiteral", quasis: [], expressions: [] },
    options: null,
  });
  assert.deepEqual(template.reports, []);

  const allowed = elementTypes(to, from);
  allowed.visitor.ImportDeclaration({
    source: { type: "Literal", value: "metabase/dayjs" },
  });
  assert.deepEqual(allowed.reports, []);
});

test("rejects unsupported policy features instead of ignoring them", () => {
  assert.throws(
    () =>
      createBoundaryChecker({
        elements,
        rules: [{ from: ["lib/*"], allow: ["lib/*"], importKind: "type" }],
        rootPath,
      }),
    /Unsupported boundary policy/,
  );
  assert.throws(
    () =>
      createBoundaryChecker({
        elements: [{ type: "lib/a", pattern: "a/*", capture: ["name"] }],
        rules: [],
        rootPath,
      }),
    /Unsupported boundary descriptor/,
  );
});
