import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

import {
  elements,
  enforcedRules,
  boundaryOptions,
  boundarySettings,
} from "../module-boundaries.mjs";
import {
  createBoundaryChecker,
  createBoundaryPlugin,
} from "../oxlint-boundaries.mjs";

const root = path.resolve(import.meta.dirname, "../../..");

const require = createRequire(import.meta.url);
const checker = createBoundaryChecker({
  elements,
  rules: enforcedRules,
  rootPath: root,
});

test("should classify full paths before folders, including dot directories", () => {
  const expectedTypes = {
    "frontend/src/metabase/static-viz/index.tsx": "app/misc",
    "frontend/src/metabase/static-viz/other.tsx": "shared/static-viz",
    "frontend/src/metabase-lib/v1/metadata/Field.ts": "basic/mlv1",
    "frontend/src/metabase-lib/query.ts": "lib/mlv2",
    "frontend/src/embedding-sdk-shared/.storybook/preview.tsx": "app/misc",
    "frontend/src/metabase/env.ts": "lib/env",
    "frontend/src/metabase/unknown-module/file.ts": null,
    "frontend/src/metabase/dayjs/.hidden/file.ts": null,
  };
  for (const [file, type] of Object.entries(expectedTypes)) {
    assert.equal(checker.classify(path.join(root, file)).type, type, file);
  }
  assert.equal(
    checker.classify(path.join(root, "e2e/fixture.ts")).isIgnored,
    true,
  );
});

test("should match upstream decisions for every declared module pair", () => {
  const pluginRoot = path.dirname(require.resolve("eslint-plugin-boundaries"));
  const { getSettings } = require(
    path.join(pluginRoot, "Settings/Validations.js"),
  );
  const { elementRulesAllowDependency } = require(
    path.join(pluginRoot, "Rules/ElementTypes.js"),
  );
  const settings = getSettings({
    settings: { ...boundarySettings, "boundaries/root-path": root },
  });
  assert.deepEqual(checker.types, [
    ...new Set(elements.map((element) => element.type)),
  ]);
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
        boundaryOptions,
      );
      assert.equal(
        checker.decision(from, to).allowed,
        expected.result,
        `${from} -> ${to}`,
      );
    }
  }
});

test("should enforce shared-tier restrictions and exceptions", () => {
  for (const { from, to, allowed } of [
    {
      from: "shared/current-user",
      to: "shared/metadata-store",
      allowed: false,
    },
    { from: "shared/metadata-store", to: "shared/current-user", allowed: true },
    { from: "shared/nav", to: "shared/palette", allowed: true },
    { from: "shared/palette", to: "shared/nav", allowed: true },
    { from: "lib/dayjs", to: "feature/query_builder", allowed: false },
  ]) {
    assert.equal(
      checker.decision(from, to).allowed,
      allowed,
      `${from} -> ${to}`,
    );
  }
  for (const type of checker.types) {
    assert.equal(checker.decision(type, type).allowed, true, type);
  }
});

function elementTypes(from, to) {
  const reports = [];
  const plugin = createBoundaryPlugin({ resolve: () => path.join(root, to) });
  const visitor = plugin.rules["element-types"].create({
    filename: path.join(root, from),
    options: [],
    report: (report) => reports.push(report),
  });
  return { visitor, reports };
}

test("should check static and dynamic imports with string sources", () => {
  const from = "frontend/src/metabase/dayjs/index.ts";
  const to = "frontend/src/metabase/query_builder/index.ts";
  const message = "lib/dayjs cannot import from feature/query_builder";
  const source = { type: "Literal", value: "metabase/query_builder" };
  const attributes = { type: "ObjectExpression", properties: [] };
  const stringAttributes = {
    type: "Literal",
    value: "metabase/query_builder/attributes",
  };
  const template = { type: "TemplateLiteral", quasis: [], expressions: [] };

  for (const { name, visit, reported } of [
    {
      name: "static import",
      visit: (visitor) => visitor.ImportDeclaration({ source }),
      reported: [source],
    },
    {
      name: "dynamic import",
      visit: (visitor) => visitor.ImportExpression({ source, options: null }),
      reported: [source],
    },
    {
      name: "dynamic import with attributes",
      visit: (visitor) =>
        visitor.ImportExpression({ source, options: attributes }),
      reported: [source],
    },
    {
      name: "dynamic import with a string second argument",
      visit: (visitor) =>
        visitor.ImportExpression({ source, options: stringAttributes }),
      reported: [source, stringAttributes],
    },
    {
      name: "template literal source",
      visit: (visitor) =>
        visitor.ImportExpression({ source: template, options: null }),
      reported: [],
    },
  ]) {
    const { visitor, reports } = elementTypes(from, to);
    visit(visitor);
    assert.deepEqual(
      reports,
      reported.map((node) => ({ node, message })),
      name,
    );
  }

  const allowed = elementTypes(to, from);
  allowed.visitor.ImportDeclaration({
    source: { type: "Literal", value: "metabase/dayjs" },
  });
  assert.deepEqual(allowed.reports, []);
});

test("should reject unsupported boundary policies", () => {
  for (const { input, error } of [
    {
      input: {
        elements,
        rules: [{ from: ["lib/*"], allow: ["lib/*"], importKind: "type" }],
      },
      error: /Unsupported boundary policy/,
    },
    {
      input: {
        elements: [{ type: "lib/a", pattern: "a/*", capture: ["name"] }],
        rules: [],
      },
      error: /Unsupported boundary descriptor/,
    },
  ]) {
    assert.throws(
      () => createBoundaryChecker({ ...input, rootPath: root }),
      error,
    );
  }
});
