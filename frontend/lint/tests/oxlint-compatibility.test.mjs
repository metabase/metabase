import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

import { createConfig, root } from "../oxlint/config.mjs";
import { decodeJsxText } from "../oxlint/jsx-text.mjs";
import ruleMap from "../oxlint/rule-map.json" with { type: "json" };

const binary = path.join(root, "node_modules/oxlint/bin/oxlint");

test("each mapped rule has its native or JS plugin loaded", () => {
  const config = createConfig();
  const loaded = new Set([
    "eslint",
    ...config.plugins,
    ...config.jsPlugins.map((p) => p.name),
  ]);
  for (const name of Object.values(ruleMap)) {
    const namespace = name.includes("/")
      ? name.slice(0, name.indexOf("/"))
      : "eslint";
    assert.ok(loaded.has(namespace), `${name}: plugin is not loaded`);
  }
});

test("JSX text decoding matches the existing TypeScript parser", () => {
  for (const value of [
    "Hello",
    "&nbsp;",
    " &amp; &quot; &apos; ",
    "&#72;&#101;&#108;&#108;&#111;",
    "&#128;",
    "&#0;",
    "&#x1f600;",
    "&#X41;",
    "&hopf;",
    "&not;",
    "&amp",
    "&amp;nbsp;",
  ]) {
    const { ast } = tseslint.parser.parseForESLint(`<span>${value}</span>`, {
      filePath: "fixture.tsx",
    });
    assert.equal(
      decodeJsxText(value),
      ast.body[0].expression.children[0].value,
      value,
    );
  }
});

test("real configuration preserves retained rules and documents accepted differences", async (t) => {
  // These locations exercise the actual frontend/e2e overrides. Unique folders
  // avoid colliding with user files or another test invocation.
  const directories = new Map();
  const directoryFor = (parent) => {
    if (!directories.has(parent))
      directories.set(
        parent,
        fs.mkdtempSync(path.join(root, parent, "__lint-fixture-")),
      );
    return directories.get(parent);
  };
  t.after(() => {
    for (const directory of directories.values())
      fs.rmSync(directory, { recursive: true, force: true });
  });
  const cases = [
    [
      "focused-test.ts",
      'test.concurrent.only("example", () => {});',
      "no-only-tests/no-only-tests",
      1,
    ],
    [
      "focused-test-disabled.ts",
      '// eslint-disable-next-line no-only-tests/no-only-tests\ntest.concurrent.only("example", () => {});',
      "no-only-tests/no-only-tests",
      0,
    ],
    [
      "ordinary-test.ts",
      'test("example", () => {}); const value = { only: true };',
      "no-only-tests/no-only-tests",
      0,
    ],
    [
      "complexity-limit.ts",
      "export function f(a){" + "if(a)a();".repeat(54) + "}",
      "complexity",
      0,
    ],
    [
      "complexity-over-limit.ts",
      "export function f(a){" + "if(a)a();".repeat(55) + "}",
      "complexity",
      1,
    ],
    [
      "complexity-disabled.ts",
      "export const f=\n/* eslint-disable complexity */\n({a}\n)=>{\n/* eslint-enable complexity */\n" +
        "if(a)a();".repeat(55) +
        "};",
      "complexity",
      0,
    ],
    [
      "module-global.js",
      'const process = require("process");',
      "eslint-js/no-redeclare",
      0,
    ],
    ["duplicate.js", "var process; var process;", "eslint-js/no-redeclare", 1],
    [
      "nested.js",
      "function f(){let name=1;return name;}",
      "eslint-js/no-redeclare",
      0,
    ],
    [
      "translation.tsx",
      "export function Example(){return <div>Hello world</div>;}",
      "i18next/no-literal-string",
      1,
    ],
    [
      "translated.tsx",
      "export function Example(){return <div>{t`Hello world`}</div>;}",
      "i18next/no-literal-string",
      0,
    ],
    [
      "entities.tsx",
      "export function Example(){return <div>&nbsp;</div>;}",
      "i18next/no-literal-string",
      0,
    ],
    [
      "encoded-translation.tsx",
      "export function Example(){return <div>&#72;&#101;&#108;&#108;&#111;</div>;}",
      "i18next/no-literal-string",
      1,
    ],
    [
      "translation-exceptions.tsx",
      "export function Example(){return <><div>OK</div><Trans>Hello world</Trans></>;}",
      "i18next/no-literal-string",
      0,
    ],
    [
      "translation-disable.tsx",
      "export function Example(){return <>\n{/* eslint-disable i18next/no-literal-string */}\n<div>Billing address</div>\n{/* eslint-enable i18next/no-literal-string */}\n</>;}",
      "i18next/no-literal-string",
      0,
    ],
    [
      "conditional.unit.spec.tsx",
      'it("example",()=>{if(value){expect(value).toBe(true);}});',
      "jest-js/no-conditional-expect",
      1,
    ],
    [
      "helper.unit.spec.tsx",
      "export function helper(){if(value){expect(value).toBe(true);}}",
      "jest-js/no-conditional-expect",
      0,
    ],
    [
      "conditional-disabled.unit.spec.tsx",
      'it("example",()=>{if(value){\n// eslint-disable-next-line jest-js/no-conditional-expect\nexpect(value).toBe(true);}});',
      "jest-js/no-conditional-expect",
      0,
    ],
    [
      "type-only.ts",
      'const token="value"; export type Token=typeof token;',
      "no-unused-vars",
      0,
      1,
      "@typescript-eslint/no-unused-vars",
    ],
    [
      "unused-disabled.ts",
      '// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional unused fixture\nconst token="value";',
      "no-unused-vars",
      0,
      0,
      "@typescript-eslint/no-unused-vars",
    ],
    [
      "unused.ts",
      "const token=1;",
      "no-unused-vars",
      1,
      1,
      "@typescript-eslint/no-unused-vars",
    ],
    [
      "augmentation.ts",
      'declare module "fake" { interface ColumnMeta<TData,TValue> {wrap?:boolean;} }',
      "no-unused-vars",
      0,
      2,
      "@typescript-eslint/no-unused-vars",
    ],
    [
      "mixed-imports.ts",
      'import {type Props,a} from "example-module"; import {b} from "example-module"; export {a,b}; export type X=Props;',
      "import/no-duplicates",
      1,
      0,
    ],
    [
      "combined-imports.ts",
      'import {type Props,a,b} from "example-module"; export {a,b}; export type X=Props;',
      "import/no-duplicates",
      0,
    ],
    [
      "separate-types.ts",
      'import type {Props} from "example-module"; import {a,b} from "example-module"; export {a,b}; export type X=Props;',
      "import/no-duplicates",
      0,
    ],
    [
      "unnamed-mock.unit.spec.tsx",
      'const {forwardRef}=jest.requireActual("react");export const Mock=forwardRef((props,ref)=><div ref={ref}/>);',
      "react/display-name",
      1,
      0,
    ],
    [
      "named-mock.unit.spec.tsx",
      'const {forwardRef}=jest.requireActual("react");export const Mock=forwardRef((props,ref)=><div ref={ref}/>);Mock.displayName="Mock";',
      "react/display-name",
      0,
    ],
    [
      "anonymous-hoc.tsx",
      'import React from "react";export const hoc=C=>class extends React.Component{render(){return <C/>}};',
      "react/display-name",
      0,
      1,
    ],
    [
      "restricted-type.ts",
      'import type {ConfigType} from "dayjs"; export type Value=ConfigType;',
      "eslint-js/no-restricted-imports",
      1,
    ],
    [
      "order.ts",
      'import z from "z";\nimport a from "a";\nexport {z,a};',
      "import-js/order",
      1,
    ],
    [
      "order-disabled.ts",
      '/* eslint-disable import-js/order */\nimport z from "z";\nimport a from "a";\nexport {z,a};',
      "import-js/order",
      0,
    ],
    ["ttag.ts", "export const text=t`Hello`;", "ttag/no-module-declaration", 1],
    [
      "ttag-block.ts",
      "for(let i=0;i<1;i++) t`Hello`;",
      "ttag/no-module-declaration",
      0,
    ],
    [
      "plain-class.tsx",
      "export class Utility {componentWillMount(){}}",
      "react-js/no-deprecated",
      0,
    ],
    [
      "react-class.tsx",
      'import React from "react"; export class Example extends React.Component{componentWillMount(){} render(){return null;}}',
      "react-js/no-deprecated",
      1,
    ],
  ].map(
    ([filename, code, rule, count, legacyCount = count, legacyRule = rule]) => {
      const parent = filename.endsWith(".js")
        ? "e2e/support"
        : "frontend/src/metabase/utils";
      const absolute = path.join(directoryFor(parent), filename);
      fs.writeFileSync(absolute, code);
      return { filename: absolute, rule, count, legacyCount, legacyRule };
    },
  );
  const result = spawnSync(
    process.execPath,
    [
      binary,
      "--threads",
      "4",
      "--disable-nested-config",
      "--report-unused-disable-directives",
      "--format",
      "json",
      ...cases.map((c) => c.filename),
    ],
    { cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const native = JSON.parse(result.stdout);
  assert.equal(
    native.number_of_files,
    cases.length,
    "Fixtures were ignored instead of linted",
  );
  const eslint = new ESLint({ cwd: root });
  const legacy = await eslint.lintFiles(cases.map((c) => c.filename));
  for (const fixture of cases) {
    const separator = fixture.rule.lastIndexOf("/");
    const code =
      separator === -1
        ? `eslint(${fixture.rule})`
        : `${fixture.rule.slice(0, separator)}(${fixture.rule.slice(separator + 1)})`;
    const findings = native.diagnostics.filter(
      (d) => path.resolve(root, d.filename) === fixture.filename,
    );
    assert.equal(
      legacy
        .find((result) => result.filePath === fixture.filename)
        .messages.filter((d) => d.ruleId === fixture.legacyRule).length,
      fixture.legacyCount,
      `ESLint ${fixture.filename}`,
    );
    assert.equal(
      findings.filter((d) => d.code === code).length,
      fixture.count,
      `Oxlint ${fixture.filename}`,
    );
    assert.equal(
      findings.filter((d) => !d.code).length,
      0,
      `Unused suppression: ${fixture.filename}`,
    );
  }
});
