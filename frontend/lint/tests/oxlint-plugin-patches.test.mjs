import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "../../..");

const require = createRequire(`${root}/package.json`);

const patchedPackages = [
  { name: "eslint-plugin-import-x", version: "4.17.1" },
  { name: "eslint-plugin-react", version: "7.37.5" },
  { name: "eslint-plugin-depend", version: "1.5.0" },
  { name: "eslint-plugin-ttag", version: "1.1.0" },
  { name: "eslint-plugin-i18next", version: "6.1.4" },
  { name: "eslint-plugin-testing-library", version: "7.15.4" },
];

// Reversing each patch over a copy of the installed package reconstructs the published one.
function upstreamPackages(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "metabase-lint-parity-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const { name, version } of patchedPackages) {
    const source = fs.realpathSync(path.join(root, "node_modules", name));
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(source, "package.json"))).version,
      version,
    );
    const target = path.join(directory, "node_modules", name);
    fs.cpSync(source, target, { recursive: true });
    if (!fs.existsSync(path.join(target, "node_modules"))) {
      // The copy reaches its own dependencies through the installed tree.
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
  ...[
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
    (statement) =>
      'import {screen,render,act,waitFor,within,fireEvent} from "@testing-library/react"; import userEvent from "@testing-library/user-event"; import aliased from "@testing-library/user-event"; async function testCase(){' +
      statement +
      "}",
  ),
  'import {act} from "react-dom/test-utils"; import {render} from "test-utils"; act(()=>render(null));',
  'const {screen}=require("@testing-library/react"); screen.debug();',
  'import {render,screen} from "@testing-library/react"; function f(screen){screen.debug();}',
  'import {screen} from "@testing-library/react"; const {debug}=console; debug("hello"); screen.debug();',
  'import {screen as otherScreen} from "@testing-library/react"; otherScreen.getByText("hello");',
  'import userEvent from "@testing-library/user-event"; import {act} from "@testing-library/react"; function f(userEvent){ const user=userEvent.setup(); act(()=>user.click(null)); }',
];

const testingSettings = [
  {},
  { "testing-library/utils-module": "test-utils" },
  {
    "testing-library/utils-module": "off",
    "testing-library/custom-renders": ["customRender"],
  },
];

const bannedDependencyCases = [
  'import x from "is-number";',
  'const x=require("is-number");',
  'const x=import("is-number");',
  'import x = require("is-number");',
  'import x from "react";',
];

const dependPrefixCases = [
  'import x from "fixture/sub/deep";',
  'import x from "fixture-extra";',
  'import x from "@scope/pkg/sub";',
  'import x from "is-number/subpath";',
];

const dependOptions = [
  { presets: [], modules: ["fixture", "fixture/sub", "@scope/pkg"] },
  { presets: [], modules: ["fixture/sub", "fixture", "@scope/pkg"] },
  {
    presets: [],
    modules: ["fixture", "fixture/sub", "@scope/pkg"],
    allowed: ["fixture"],
  },
  { allowed: ["is-number"] },
];

const reactCases = [
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
];

const importOrderCases = [
  'import a from "../parent"; import fs from "node:fs"; import b from "./sibling";',
  'import a from "./index"; import b from "react"; import c from "../missing";',
  'import a from "/absolute/missing"; import b from "."; import c from "..";',
  'import a from "@scope/missing"; import b from "./missing";',
  'import a from "metabase/lib"; import b from "react";',
];

const importSettings = [
  {},
  { "import-x/internal-regex": "^\\." },
  { "import-x/core-modules": [".", ".."] },
];

test("should preserve diagnostics and fixes for patched rules", async (t) => {
  const upstreamRoot = upstreamPackages(t);
  const upstreamRequire = createRequire(`${upstreamRoot}/package.json`);
  const upstreamImport = (specifier) =>
    import(`${upstreamRoot}/node_modules/${specifier}`);
  const { Linter, ESLint } = require("eslint");
  const { parser } = require("typescript-eslint");
  const { fixupPluginRules } = require("@eslint/compat");
  const plugins = {
    ttag: {
      // The ttag patch adds the modern rule API,
      // so only the upstream copy needs the compatibility wrapper.
      upstream: fixupPluginRules(upstreamRequire("eslint-plugin-ttag")),
      patched: require("eslint-plugin-ttag"),
    },
    i18next: {
      upstream: upstreamRequire("eslint-plugin-i18next"),
      patched: require("eslint-plugin-i18next"),
    },
    "testing-library": {
      upstream: (
        await upstreamImport("eslint-plugin-testing-library/dist/index.mjs")
      ).default,
      patched: (await import("eslint-plugin-testing-library")).default,
    },
    depend: {
      upstream: await upstreamImport("eslint-plugin-depend/lib/main.js"),
      patched: await import("eslint-plugin-depend"),
    },
    react: {
      upstream: upstreamRequire("eslint-plugin-react"),
      patched: require("eslint-plugin-react"),
    },
    "import-x": {
      // Oxlint loads import-x's ESM entry point.
      upstream: (await upstreamImport("eslint-plugin-import-x/lib/index.js"))
        .default,
      patched: (await import("eslint-plugin-import-x")).default,
    },
  };

  const eslint = new ESLint({ cwd: root });
  const config = await eslint.calculateConfigForFile(
    `${root}/enterprise/frontend/src/embedding-sdk-ee/metabot/MetabotChatHistory.unit.spec.tsx`,
  );
  const testingRules = Object.fromEntries(
    Object.entries(config.rules).filter(([name]) =>
      name.startsWith("testing-library/"),
    ),
  );
  assert.ok(Object.keys(testingRules).length >= 20);

  const stats = {};
  function compare({ name, sources, rules, settings = {} }) {
    for (const source of sources) {
      const [upstream, patched] = [
        plugins[name].upstream,
        plugins[name].patched,
      ].map((plugin) => {
        const linter = new Linter();
        const config = [
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
          messages: linter.verify(source, config, { filename: "fixture.tsx" }),
          fix: linter.verifyAndFix(source, config, { filename: "fixture.tsx" }),
        };
      });
      assert.ok(
        !upstream.messages.some((message) => message.fatal),
        `invalid fixture ${source}`,
      );
      assert.deepEqual(patched, upstream, `${name} ${source}`);
      stats[name] ??= { cases: 0, violations: 0 };
      stats[name].cases++;
      stats[name].violations += upstream.messages.length;
    }
  }

  async function parity(name, groups) {
    await t.test(`should preserve ${name} diagnostics and fixes`, () => {
      for (const group of groups) {
        compare({ name, ...group });
      }
      assert.ok(
        stats[name].violations > 0,
        `${name}: fixtures must exercise reporting paths`,
      );
    });
  }

  await parity("ttag", [
    { sources: ttagCases, rules: { "ttag/no-module-declaration": "error" } },
  ]);
  await parity(
    "i18next",
    ["jsx-only", "jsx-text-only", "all"].map((mode) => ({
      sources: translationCases,
      rules: { "i18next/no-literal-string": ["error", { mode }] },
    })),
  );
  await parity(
    "testing-library",
    testingSettings.map((settings) => ({
      sources: testingCases,
      rules: testingRules,
      settings,
    })),
  );
  await parity("depend", [
    {
      sources: bannedDependencyCases,
      rules: { "depend/ban-dependencies": "error" },
    },
    ...dependOptions.map((options) => ({
      sources: dependPrefixCases,
      rules: { "depend/ban-dependencies": ["error", options] },
    })),
  ]);
  await parity("react", [
    {
      sources: reactCases,
      rules: { "react/no-deprecated": "error" },
      settings: { react: { version: "18.2.0" } },
    },
  ]);
  await parity(
    "import-x",
    importSettings.map((settings) => ({
      sources: importOrderCases,
      rules: {
        "import-x/order": [
          "error",
          { "newlines-between": "always", alphabetize: { order: "asc" } },
        ],
      },
      settings,
    })),
  );

  t.diagnostic(
    JSON.stringify({
      byPlugin: stats,
      diagnosticsAndFixesIdentical: true,
    }),
  );
});
