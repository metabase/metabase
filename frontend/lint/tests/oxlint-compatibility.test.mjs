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

test("should load every mapped rule", () => {
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

test("should decode JSX text like the TypeScript parser", () => {
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

const compatibilityCases = [
  {
    filename: "jsx-unused.tsx",
    code: 'import {Used,Unused} from "components"; import * as UI from "components"; export const Example=()=> <><Used/><UI.Button/></>;',
    rule: "no-unused-vars",
    eslintRule: "@typescript-eslint/no-unused-vars",
    oxlint: 1,
  },
  {
    filename: "depend.ts",
    code: 'import isNumber from "is-number"; export const check = isNumber;',
    rule: "depend/ban-dependencies",
    oxlint: 1,
  },
  {
    filename: "depend-subpath.ts",
    code: 'import isNumber from "is-number/index.js"; export const check = isNumber;',
    rule: "depend/ban-dependencies",
    oxlint: 1,
  },
  {
    filename: "testing-debug.unit.spec.tsx",
    code: 'import {screen} from "@testing-library/react"; test("example",()=>screen.debug());',
    rule: "testing-library/no-debugging-utils",
    oxlint: 1,
  },
  {
    filename: "testing-act.unit.spec.tsx",
    code: 'import {act,render} from "@testing-library/react"; test("example",()=>act(()=>render(<div/>)));',
    rule: "testing-library/no-unnecessary-act",
    oxlint: 1,
  },
  {
    filename: "testing-screen.unit.spec.tsx",
    code: 'import {render} from "@testing-library/react"; test("example",()=>{const {getByText}=render(<div/>);getByText("Hello");});',
    rule: "testing-library/prefer-screen-queries",
    oxlint: 1,
  },
  {
    filename: "focused-test.ts",
    code: 'test.concurrent.only("example", () => {});',
    rule: "no-only-tests/no-only-tests",
    oxlint: 1,
  },
  {
    filename: "focused-test-disabled.ts",
    code: '// eslint-disable-next-line no-only-tests/no-only-tests\ntest.concurrent.only("example", () => {});',
    rule: "no-only-tests/no-only-tests",
    oxlint: 0,
  },
  {
    filename: "ordinary-test.ts",
    code: 'test("example", () => {}); const value = { only: true };',
    rule: "no-only-tests/no-only-tests",
    oxlint: 0,
  },
  {
    filename: "complexity-limit.ts",
    code: "export function f(a){" + "if(a)a();".repeat(54) + "}",
    rule: "complexity",
    oxlint: 0,
  },
  {
    filename: "complexity-over-limit.ts",
    code: "export function f(a){" + "if(a)a();".repeat(55) + "}",
    rule: "complexity",
    oxlint: 1,
  },
  {
    filename: "complexity-disabled.ts",
    code:
      "export const f=\n/* eslint-disable complexity */\n({a}\n)=>{\n/* eslint-enable complexity */\n" +
      "if(a)a();".repeat(55) +
      "};",
    rule: "complexity",
    oxlint: 0,
  },
  {
    filename: "module-global.js",
    directory: "e2e/support",
    code: 'const process = require("process");',
    rule: "eslint-js/no-redeclare",
    oxlint: 0,
  },
  {
    filename: "duplicate.js",
    directory: "e2e/support",
    code: "var process; var process;",
    rule: "eslint-js/no-redeclare",
    oxlint: 1,
  },
  {
    filename: "nested.js",
    directory: "e2e/support",
    code: "function f(){let name=1;return name;}",
    rule: "eslint-js/no-redeclare",
    oxlint: 0,
  },
  {
    filename: "translation.tsx",
    code: "export function Example(){return <div>Hello world</div>;}",
    rule: "i18next/no-literal-string",
    oxlint: 1,
  },
  {
    filename: "translated.tsx",
    code: "export function Example(){return <div>{t`Hello world`}</div>;}",
    rule: "i18next/no-literal-string",
    oxlint: 0,
  },
  {
    filename: "entities.tsx",
    code: "export function Example(){return <div>&nbsp;</div>;}",
    rule: "i18next/no-literal-string",
    oxlint: 0,
  },
  {
    filename: "encoded-translation.tsx",
    code: "export function Example(){return <div>&#72;&#101;&#108;&#108;&#111;</div>;}",
    rule: "i18next/no-literal-string",
    oxlint: 1,
  },
  {
    filename: "translation-exceptions.tsx",
    code: "export function Example(){return <><div>OK</div><Trans>Hello world</Trans></>;}",
    rule: "i18next/no-literal-string",
    oxlint: 0,
  },
  {
    filename: "translation-disable.tsx",
    code: "export function Example(){return <>\n{/* eslint-disable i18next/no-literal-string */}\n<div>Billing address</div>\n{/* eslint-enable i18next/no-literal-string */}\n</>;}",
    rule: "i18next/no-literal-string",
    oxlint: 0,
  },
  {
    filename: "conditional.unit.spec.tsx",
    code: 'it("example",()=>{if(value){expect(value).toBe(true);}});',
    rule: "jest-js/no-conditional-expect",
    oxlint: 1,
  },
  {
    filename: "helper.unit.spec.tsx",
    code: "export function helper(){if(value){expect(value).toBe(true);}}",
    rule: "jest-js/no-conditional-expect",
    oxlint: 0,
  },
  {
    filename: "conditional-disabled.unit.spec.tsx",
    code: 'it("example",()=>{if(value){\n// eslint-disable-next-line jest-js/no-conditional-expect\nexpect(value).toBe(true);}});',
    rule: "jest-js/no-conditional-expect",
    oxlint: 0,
  },
  {
    filename: "type-only.ts",
    code: 'const token="value"; export type Token=typeof token;',
    rule: "no-unused-vars",
    oxlint: 0,
    eslint: 1,
    eslintRule: "@typescript-eslint/no-unused-vars",
  },
  {
    filename: "unused-disabled.ts",
    code: '// eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional unused fixture\nconst token="value";',
    rule: "no-unused-vars",
    oxlint: 0,
    eslint: 0,
    eslintRule: "@typescript-eslint/no-unused-vars",
  },
  {
    filename: "unused.ts",
    code: "const token=1;",
    rule: "no-unused-vars",
    oxlint: 1,
    eslint: 1,
    eslintRule: "@typescript-eslint/no-unused-vars",
  },
  {
    filename: "augmentation.ts",
    code: 'declare module "fake" { interface ColumnMeta<TData,TValue> {wrap?:boolean;} }',
    rule: "no-unused-vars",
    oxlint: 0,
    eslint: 2,
    eslintRule: "@typescript-eslint/no-unused-vars",
  },
  {
    filename: "mixed-imports.ts",
    code: 'import {type Props,a} from "example-module"; import {b} from "example-module"; export {a,b}; export type X=Props;',
    rule: "import/no-duplicates",
    oxlint: 1,
    eslint: 0,
  },
  {
    filename: "combined-imports.ts",
    code: 'import {type Props,a,b} from "example-module"; export {a,b}; export type X=Props;',
    rule: "import/no-duplicates",
    oxlint: 0,
  },
  {
    filename: "separate-types.ts",
    code: 'import type {Props} from "example-module"; import {a,b} from "example-module"; export {a,b}; export type X=Props;',
    rule: "import/no-duplicates",
    oxlint: 0,
  },
  {
    filename: "unnamed-mock.unit.spec.tsx",
    code: 'const {forwardRef}=jest.requireActual("react");export const Mock=forwardRef((props,ref)=><div ref={ref}/>);',
    rule: "react/display-name",
    oxlint: 1,
    eslint: 0,
  },
  {
    filename: "named-mock.unit.spec.tsx",
    code: 'const {forwardRef}=jest.requireActual("react");export const Mock=forwardRef((props,ref)=><div ref={ref}/>);Mock.displayName="Mock";',
    rule: "react/display-name",
    oxlint: 0,
  },
  {
    filename: "anonymous-hoc.tsx",
    code: 'import React from "react";export const hoc=C=>class extends React.Component{render(){return <C/>}};',
    rule: "react/display-name",
    oxlint: 0,
    eslint: 1,
  },
  {
    filename: "restricted-type.ts",
    code: 'import type {ConfigType} from "dayjs"; export type Value=ConfigType;',
    rule: "eslint-js/no-restricted-imports",
    oxlint: 1,
  },
  {
    filename: "ttag.ts",
    code: "export const text=t`Hello`;",
    rule: "ttag/no-module-declaration",
    oxlint: 1,
  },
  {
    filename: "ttag-block.ts",
    code: "for(let i=0;i<1;i++) t`Hello`;",
    rule: "ttag/no-module-declaration",
    oxlint: 0,
  },
  {
    filename: "plain-class.tsx",
    code: "export class Utility {componentWillMount(){}}",
    rule: "react-js/no-deprecated",
    oxlint: 0,
  },
  {
    filename: "react-class.tsx",
    code: 'import React from "react"; export class Example extends React.Component{componentWillMount(){} render(){return null;}}',
    rule: "react-js/no-deprecated",
    oxlint: 1,
  },
];

// Oxlint names a rule as namespace(rule), with eslint standing in for the unprefixed rules.
function diagnosticCode(rule) {
  const separator = rule.lastIndexOf("/");
  return separator === -1
    ? `eslint(${rule})`
    : `${rule.slice(0, separator)}(${rule.slice(separator + 1)})`;
}

test("should apply the configured rules and suppressions", async (t) => {
  // Fixture paths must match the frontend and e2e policy overrides.
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
  const cases = compatibilityCases.map(
    ({
      filename,
      code,
      directory = "frontend/src/metabase/utils",
      rule,
      oxlint,
      eslint = oxlint,
      eslintRule = rule,
    }) => {
      const absolute = path.join(directoryFor(directory), filename);
      fs.writeFileSync(absolute, code);
      return { filename: absolute, rule, oxlint, eslint, eslintRule };
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
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const native = JSON.parse(result.stdout);
  assert.equal(
    native.number_of_files,
    cases.length,
    "Fixtures were ignored instead of linted",
  );
  const nativeByFile = Map.groupBy(native.diagnostics, (diagnostic) =>
    path.resolve(root, diagnostic.filename),
  );
  const eslint = new ESLint({ cwd: root });
  const legacy = await eslint.lintFiles(cases.map((c) => c.filename));
  const legacyByFile = new Map(
    legacy.map((result) => [result.filePath, result.messages]),
  );
  for (const fixture of cases) {
    await t.test(
      `should apply ${fixture.rule} to ${path.basename(fixture.filename)}`,
      () => {
        const findings = nativeByFile.get(fixture.filename) ?? [];
        const code = diagnosticCode(fixture.rule);
        assert.equal(
          legacyByFile
            .get(fixture.filename)
            .filter((d) => d.ruleId === fixture.eslintRule).length,
          fixture.eslint,
          `ESLint ${fixture.filename}`,
        );
        assert.equal(
          findings.filter((d) => d.code === code).length,
          fixture.oxlint,
          `Oxlint ${fixture.filename}`,
        );
        assert.equal(
          findings.filter((d) => !d.code).length,
          0,
          `Unused suppression: ${fixture.filename}`,
        );
      },
    );
  }
});
