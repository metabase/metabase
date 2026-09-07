import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

function setupUpstreamPackages(root, t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "metabase-lint-parity-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, version] of [
    ["eslint-plugin-import-x", "4.17.1"],
    ["eslint-plugin-react", "7.37.5"],
    ["eslint-plugin-depend", "1.5.0"],
    ["eslint-plugin-ttag", "1.1.0"],
    ["eslint-plugin-i18next", "6.1.4"],
    ["eslint-plugin-testing-library", "7.15.4"],
  ]) {
    const source = fs.realpathSync(path.join(root, "node_modules", name));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(source, "package.json"))).version,
      version,
    );
    const target = path.join(directory, "node_modules", name);
    fs.cpSync(source, target, { recursive: true });
    if (!fs.existsSync(path.join(target, "node_modules"))) {
      fs.symlinkSync(
        path.dirname(source),
        path.join(target, "node_modules"),
        "dir",
      );
    }
    execFileSync(
      "patch",
      [
        "--batch",
        "--reverse",
        "-p1",
        "-d",
        directory,
        "-i",
        path.join(root, "patches", `${name}+${version}.patch`),
      ],
      { encoding: "utf8", timeout: 60_000 },
    );
  }
  return directory;
}

test("should preserve diagnostics and fixes for patched rules", async (t) => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const upstreamRoot = setupUpstreamPackages(root, t);
  const require = createRequire(root + "/package.json");
  const upstreamRequire = createRequire(upstreamRoot + "/package.json");
  const { Linter, ESLint } = require("eslint");
  const { parser } = require("typescript-eslint");
  const { fixupPluginRules } = require("@eslint/compat");
  const upstreamTtag = fixupPluginRules(upstreamRequire("eslint-plugin-ttag"));
  const ttag = require("eslint-plugin-ttag");
  const upstreamI18next = fixupPluginRules(
    upstreamRequire("eslint-plugin-i18next"),
  );
  const i18next = require("eslint-plugin-i18next");
  const upstreamTesting = (
    await import(
      upstreamRoot +
        "/node_modules/eslint-plugin-testing-library/dist/index.mjs"
    )
  ).default;
  const testingLibrary = (await import("eslint-plugin-testing-library"))
    .default;
  const upstreamDepend = await import(
    upstreamRoot + "/node_modules/eslint-plugin-depend/lib/main.js"
  );
  const depend = await import("eslint-plugin-depend");
  const eslint = new ESLint({ cwd: root });
  const config = await eslint.calculateConfigForFile(
    root +
      "/enterprise/frontend/src/embedding-sdk-ee/metabot/MetabotChatHistory.unit.spec.tsx",
  );
  const testingRules = Object.fromEntries(
    Object.entries(config.rules).filter(([name]) =>
      name.startsWith("testing-library/"),
    ),
  );
  assert.ok(Object.keys(testingRules).length >= 20);
  const ttagCases = [
    "const x=t`Hello`;",
    "const x=jt`Hello ${name}`;",
    'const x=gettext("Hello");',
    'const x=ngettext("one","many",n);',
    "const x=other`Hello`;",
    "function f(){return t`Hello`;}",
    "const f=()=>t`Hello`;",
    'const f=function(){return gettext("Hello");};',
    "function f(x=t`Hello`){return x;}",
    'const f=(x=gettext("Hello"))=>x;',
    "{ const x=t`Hello`; }",
    "for(let i=0;i<1;i++){t`Hello`;}",
    "for(const x of [t`Hello`]){}",
    'class C { field=t`Hello`; method(){return t`Hello`;} static {gettext("Hi");} }',
    "class C extends factory(t`Hello`) {}",
    "namespace N { export const x=t`Hello`; }",
    "const C=()=> <div>{t`Hello`}</div>;",
    "const x=fn(()=>t`Hello`,t`Outer`);",
    "const x=(t`Hello` satisfies string);",
    "export default t`Hello`;",
  ];
  const translationCases = [
    "const C=()=> <div>Hello world</div>;",
    "const C=()=> <div>{t`Hello world`}</div>;",
    'const C=()=> <div title="Hello">Hi</div>;',
    'const C=()=> <div className="foo" data-testid="bar">{42}</div>;',
    "const C=()=> <Trans>Hello</Trans>;",
    'const C=()=> <><div>{"Hello"}</div><div>{`Hello ${name}`}</div></>;',
    "const C=()=> <div>&nbsp; Hello &amp; world</div>;",
    'const x="Outside JSX";',
    'const C=()=> <Icon name="add"/>;',
    'const C=()=> <div>{gettext("Hello")}</div>;',
  ];
  const testingCases = [
    'const el=screen.getByText("Hello"); expect(el).toBeInTheDocument();',
    'screen.findByText("Hello");',
    'await screen.findByText("Hello");',
    'await waitFor(()=> {expect(screen.getByText("Hi")).toBeInTheDocument();expect(true).toBe(true);});',
    "act(()=> {render(<div/>);});",
    "act(()=>render(<div/>));",
    'const user=userEvent.setup(); await act(async()=> {await user.click(screen.getByRole("button"));});',
    'const user=aliased.setup(); await act(async()=> {await user.click(screen.getByRole("button"));});',
    "const user=local.setup();",
    "const {user}=userEvent.setup();",
    "const x=unrelated();",
    'const x=screen.getByRole("button");',
    'const x=userEvent["setup"]();',
    "const x=userEvent?.setup();",
    "const x=setup();",
    "screen.debug();",
    'const {getByText}=render(<div/>); getByText("hello");',
    'within(screen.getByRole("dialog")).getByText("Hello");',
    'fireEvent.click(screen.getByRole("button"));',
    'await userEvent.click(screen.getByRole("button"));',
  ].map(
    (s) =>
      'import {screen,render,act,waitFor,within,fireEvent} from "@testing-library/react"; import userEvent from "@testing-library/user-event"; import aliased from "@testing-library/user-event"; async function testCase(){' +
      s +
      "}",
  );
  testingCases.push(
    'import {act} from "react-dom/test-utils"; import {render} from "test-utils"; act(()=>render(null));',
  );
  testingCases.push(
    'const {screen}=require("@testing-library/react"); screen.debug();',
  );
  testingCases.push(
    'import {render,screen} from "@testing-library/react"; function f(screen){screen.debug();}',
  );
  testingCases.push(
    'import {screen} from "@testing-library/react"; const {debug}=console; debug("hello"); screen.debug();',
  );
  testingCases.push(
    'import {screen as otherScreen} from "@testing-library/react"; otherScreen.getByText("hello");',
  );
  testingCases.push(
    'import userEvent from "@testing-library/user-event"; import {act} from "@testing-library/react"; function f(userEvent){ const user=userEvent.setup(); act(()=>user.click(null)); }',
  );
  let cases = 0;
  let violations = 0;
  const counts = {};
  const violationsByPlugin = {};
  function compare(name, upstream, patched, sources, rules, settings = {}) {
    for (const source of sources) {
      const results = [upstream, patched].map((plugin) => {
        const linter = new Linter();
        const cfg = [
          {
            files: ["**/*.tsx"],
            languageOptions: {
              parser,
              parserOptions: { ecmaFeatures: { jsx: true } },
            },
            plugins: { [name]: plugin },
            settings,
            rules,
          },
        ];
        return {
          messages: linter.verify(source, cfg, { filename: "fixture.tsx" }),
          fix: linter.verifyAndFix(source, cfg, { filename: "fixture.tsx" }),
        };
      });
      assert.ok(
        !results[0].messages.some((m) => m.fatal),
        "invalid fixture " + source,
      );
      assert.deepEqual(results[1], results[0], name + " " + source);
      cases++;
      violations += results[0].messages.length;
      violationsByPlugin[name] =
        (violationsByPlugin[name] ?? 0) + results[0].messages.length;
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  await t.test("should preserve ttag diagnostics and fixes", () => {
    compare("ttag", upstreamTtag, ttag, ttagCases, {
      "ttag/no-module-declaration": "error",
    });
  });
  await t.test("should preserve i18next diagnostics and fixes", () => {
    for (const mode of ["jsx-only", "jsx-text-only", "all"])
      compare("i18next", upstreamI18next, i18next, translationCases, {
        "i18next/no-literal-string": ["error", { mode }],
      });
  });
  await t.test("should preserve Testing Library diagnostics and fixes", () => {
    for (const settings of [
      {},
      { "testing-library/utils-module": "test-utils" },
      {
        "testing-library/utils-module": "off",
        "testing-library/custom-renders": ["customRender"],
      },
    ])
      compare(
        "testing-library",
        upstreamTesting,
        testingLibrary,
        testingCases,
        testingRules,
        settings,
      );
  });
  await t.test("should preserve depend diagnostics and fixes", () => {
    compare(
      "depend",
      fixupPluginRules(upstreamDepend),
      depend,
      [
        'import x from "is-number";',
        'const x=require("is-number");',
        'const x=import("is-number");',
        'import x = require("is-number");',
        'import x from "react";',
      ],
      { "depend/ban-dependencies": "error" },
    );
    for (const options of [
      { presets: [], modules: ["fixture", "fixture/sub", "@scope/pkg"] },
      { presets: [], modules: ["fixture/sub", "fixture", "@scope/pkg"] },
      {
        presets: [],
        modules: ["fixture", "fixture/sub", "@scope/pkg"],
        allowed: ["fixture"],
      },
      { allowed: ["is-number"] },
    ]) {
      compare(
        "depend",
        upstreamDepend,
        depend,
        [
          'import x from "fixture/sub/deep";',
          'import x from "fixture-extra";',
          'import x from "@scope/pkg/sub";',
          'import x from "is-number/subpath";',
        ],
        { "depend/ban-dependencies": ["error", options] },
      );
    }
  });
  await t.test("should preserve React diagnostics and fixes", () => {
    compare(
      "react",
      upstreamRequire("eslint-plugin-react"),
      require("eslint-plugin-react"),
      [
        'import React from "react"; class C extends React.Component { componentWillMount() {} render(){return <div/>;} }',
        'import React from "react"; class C extends React.PureComponent { componentWillReceiveProps() {} render(){return null;} }',
        'import React from "react"; class C extends React.Component { componentWillUpdate() {} render(){return null;} }',
        'import React from "react"; class C extends React.Component { componentDidMount() {} render(){return null;} }',
        'import React from "react"; class C extends React.Component { UNSAFE_componentWillMount() {} render(){return null;} }',
        'import React from "react"; const C=React.createClass({componentWillMount(){},render(){return null;}});',
        'import createReactClass from "create-react-class"; const C=createReactClass({componentWillMount(){},render(){return null;}});',
        "class Plain { componentWillMount() {} }",
        "const obj={componentWillMount(){}};",
        "const C=()=> <div/>;",
        'import React from "react"; React.render(<div/>, target);',
        'import React from "react"; class C extends React.Component { ["componentWillMount"]() {} render(){return null;} }',
      ],
      { "react/no-deprecated": "error" },
      { react: { version: "18.2.0" } },
    );
  });
  await t.test("should preserve import-x diagnostics and fixes", async () => {
    // Oxlint loads import-x's ESM entry point.
    const upstreamImport = await import(
      upstreamRoot + "/node_modules/eslint-plugin-import-x/lib/index.js"
    );
    const patchedImport = await import("eslint-plugin-import-x");
    for (const settings of [
      {},
      { "import-x/internal-regex": "^\\." },
      { "import-x/core-modules": [".", ".."] },
    ]) {
      compare(
        "import-x",
        upstreamImport.default,
        patchedImport.default,
        [
          'import a from "../parent"; import fs from "node:fs"; import b from "./sibling";',
          'import a from "./index"; import b from "react"; import c from "../missing";',
          'import a from "/absolute/missing"; import b from "."; import c from "..";',
          'import a from "@scope/missing"; import b from "./missing";',
          'import a from "metabase/lib"; import b from "react";',
        ],
        {
          "import-x/order": [
            "error",
            { "newlines-between": "always", alphabetize: { order: "asc" } },
          ],
        },
        settings,
      );
    }
  });
  for (const name of Object.keys(counts)) {
    assert.ok(
      violationsByPlugin[name] > 0,
      `${name}: fixtures must exercise reporting paths`,
    );
  }
  t.diagnostic(
    JSON.stringify({
      fixtureCases: cases,
      upstreamViolations: violations,
      byPlugin: counts,
      violationsByPlugin,
      diagnosticsAndFixesIdentical: true,
    }),
  );
});
