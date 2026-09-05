import path from "path";

import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-module-side-effects";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
    sourceType: "module",
  },
});

const FILENAME = "/repo/frontend/src/metabase/widgets/Widget/Widget.tsx";
const REGISTRATION_FILE =
  "/repo/frontend/src/metabase/widgets/Widget/register-widget.ts";

const REGISTRATION_DIR = "/repo/frontend/src/metabase/widgets/api/";

const options = [{ sideEffectPaths: [REGISTRATION_FILE, REGISTRATION_DIR] }];

// Real files, because the import check resolves each import on disk before looking it up.
// registry.json classifies effects/{global,entry,self,registration}.ts, leaves unclassified.ts
// unclassified, names facade/ a facade, and lists the packages leaflet-draw and @mantine/core/styles.css.
// pure.ts is not listed.
const FIXTURES = path.resolve(__dirname, "fixtures/side-effect-files");
const IMPORTER = path.join(FIXTURES, "importer/Widget.tsx");
const registryOptions = {
  sideEffectRegistry: path.join(FIXTURES, "registry.json"),
  sourceRoots: ["frontend/lint/tests/fixtures/side-effect-files"],
};

const VALID_CASES = [
  {
    name: "Mantine config helper",
    code: `
      import { Button } from "@mantine/core";
      export const buttonOverrides = { Button: Button.extend({ classNames: {} }) };
    `,
  },
  {
    name: "Mantine dates config helper",
    code: `
      import { DateInput } from "@mantine/dates";
      export const overrides = { DateInput: DateInput.extend({}) };
    `,
  },
  {
    name: "react element factories",
    code: `
      import { createContext, forwardRef, memo } from "react";
      export const Ctx = createContext(null);
      export const A = forwardRef(function A(props, ref) { return null; });
      export const B = memo(A);
    `,
  },
  {
    name: "react namespace import",
    code: `
      import React from "react";
      export const Ctx = React.createContext(null);
      export const Lazy = React.lazy(() => import("./Heavy"));
    `,
  },
  {
    name: "renamed pure import",
    code: `
      import { memo as remember } from "react";
      export const B = remember(function B() { return null; });
    `,
  },
  {
    name: "classnames",
    code: `
      import cx from "classnames";
      export const className = cx("a", "b");
    `,
  },
  {
    name: "ttag tagged templates",
    code: `
      import { c, t } from "ttag";
      export const LABEL = t\`Hello\`;
      export const CONTEXT_LABEL = c("a greeting").t\`Hello\`;
    `,
  },
  {
    name: "emotion styled",
    code: `
      import styled from "@emotion/styled";
      import { Icon } from "./Icon";
      export const FixedSizeIcon = styled(Icon)\`flex-shrink: 0;\`;
    `,
  },
  {
    name: "freezing a same-file object",
    code: `
      const FALLBACK = { charts: [] };
      Object.freeze(FALLBACK);
      Object.freeze(FALLBACK.charts);
    `,
  },
  {
    name: "assigning onto a same-file object",
    code: `
      import { Menu as MantineMenu } from "@mantine/core";
      function Menu(props) { return null; }
      Object.assign(Menu, MantineMenu, { Item });
      const Item = () => null;
    `,
  },
  {
    name: "displayName on a same-file component",
    code: `
      import { HoverCard as MantineHoverCard } from "@mantine/core";
      const MantineDropdown = MantineHoverCard.Dropdown;
      const HoverCardDropdown = function Dropdown() { return null; };
      HoverCardDropdown.displayName = MantineDropdown.displayName;
    `,
  },
  {
    name: "compound component members on a same-file component",
    code: `
      import { Menu as MantineMenu } from "@mantine/core";
      export function Menu(props) { return null; }
      Menu.Item = MantineMenu.Item;
    `,
  },
  {
    name: "builtin containers",
    code: `
      export const cache = new Map();
      export const seen = new Set([1, 2]);
      export const RE = new RegExp("x");
    `,
  },
  {
    name: "array spread and map on a same-file value",
    code: `
      const BASE = ["a", "b"];
      export const ALL = [...BASE, "c"].map((name) => name.toUpperCase());
    `,
  },
  {
    name: "optional chaining reads",
    code: `
      const win = typeof window !== "undefined" ? window : ({} as Window);
      const tokenFeatures = win.MetabaseBootstrap?.["token-features"] ?? {};
      export const shouldWhitelabel = !!tokenFeatures["whitelabel"];
    `,
  },
  {
    name: "annotated Object.assign onto an import",
    code: `
      import { Popover as MantinePopover } from "@mantine/core";
      export const Popover = /* #__PURE__ */ Object.assign(MantinePopover, { Dropdown });
      const Dropdown = () => null;
    `,
  },
  {
    name: "annotated call on a package (@ form)",
    code: `
      import { registerThing } from "some-registry";
      export const thing = /* @__PURE__ */ registerThing();
    `,
  },
  {
    name: "annotated call on a package through a cast",
    code: `
      import { registerThing } from "some-registry";
      export const thing = /* #__PURE__ */ registerThing() as unknown;
    `,
  },
  {
    name: "annotated statement",
    code: `
      import { registerThing } from "./registry";
      /* #__PURE__ */ registerThing();
    `,
  },
  {
    name: "css module binding import",
    code: `
      import S from "./Widget.module.css";
      export const className = S.root;
    `,
  },
  {
    name: "bare import of a listed side-effect file",
    code: `import "./register-widget";`,
    filename: FILENAME,
    options,
  },
  {
    name: "bare import of a listed side-effect file with extension",
    code: `import "./register-widget.ts";`,
    filename: FILENAME,
    options,
  },
  {
    name: "bare import of a file under a listed side-effect directory",
    code: `import "../api/nested/register-endpoints";`,
    filename: FILENAME,
    options,
  },
  {
    name: "enum",
    code: `
      export enum Size { Small = "sm", Large = "lg" }
      const enum Inline { A = 1 }
    `,
  },
  {
    name: "object literal export",
    code: `
      export const CONFIG = { a: 1, b: [1, 2], c: { d: () => 1 } };
    `,
  },
  {
    name: "class and function declarations",
    code: `
      import { Base } from "./base";
      export class Foo extends Base { static x = init(); }
      export function bar() { return dayjs.extend(utc); }
      export default function baz() {}
    `,
  },
  {
    name: "effects inside function bodies",
    code: `
      import dayjs from "dayjs";
      import utc from "dayjs/plugin/utc";
      export function setup() { dayjs.extend(utc); window.foo = 1; }
      export const setupArrow = () => { dayjs.extend(utc); };
    `,
  },
  {
    name: "type-only statements",
    code: `
      import type { X } from "./x";
      export type Y = X;
      export interface Z { y: Y }
      declare global { interface Window { foo: number } }
    `,
  },
  {
    name: "call on a relative import in an initializer",
    code: `
      import { getBaseColors } from "./constants/base-colors";
      import { DEFAULT_ACCENT_COLORS } from "./constants/accent-colors";
      export const baseColors = getBaseColors();
      export const charts = DEFAULT_ACCENT_COLORS.flatMap((c) => [c]);
    `,
  },
  {
    name: "call on an in-repo alias import in an initializer",
    code: `
      import { createThunkAction } from "metabase/lib/redux";
      import * as Lib from "metabase-lib";
      export const RUN = createThunkAction("RUN", () => () => {});
      export const stage = Lib.stageCount({});
    `,
    options: [{ internalModules: ["metabase", "metabase-lib"] }],
  },
  {
    name: "redux and underscore composition helpers",
    code: `
      import { createSelector } from "@reduxjs/toolkit";
      import { connect } from "react-redux";
      import _ from "underscore";
      export const getA = createSelector([(s) => s], (s) => s);
      export const Connected = _.compose(connect(() => ({})))(function View() {});
    `,
  },
  {
    name: "same-file call in an initializer",
    code: `
      function buildTheme() { return {}; }
      export const theme = buildTheme();
    `,
  },
  {
    name: "builtin call in an initializer",
    code: `
      export const KEYS = Object.keys({ a: 1 });
      export const NOW = Date.now();
    `,
  },
  {
    name: "constructing an imported class in an initializer",
    code: `
      import { EventEmitter } from "events";
      export const emitter = new EventEmitter();
    `,
  },
  {
    name: "call on an import through a cast, in a local declaration, allowlisted",
    code: `
      import { factory } from "@mantine/core";
      export const X = (factory(function X() {}) as unknown)!;
    `,
  },
  {
    name: "jsx element export",
    code: `
      import { Icon } from "./Icon";
      export const DEFAULT_ICON = <Icon name="x" />;
    `,
  },
  {
    name: "extra pure callee from options",
    code: `
      import dayjs from "dayjs";
      export const now = dayjs();
    `,
    options: [{ pureCallees: [{ module: "dayjs", names: "*" }] }],
  },
  {
    name: "imports a file whose effect is its own",
    code: `import { self } from "../effects/self";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "imports a facade",
    code: `import { facade } from "../facade";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "imports an unregistered file",
    code: `import { pure } from "../effects/pure";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "imports a global-effect file listed in sideEffectPaths",
    code: `import { registration } from "../effects/registration";`,
    filename: IMPORTER,
    options: [
      {
        ...registryOptions,
        sideEffectPaths: [path.join(FIXTURES, "effects/registration.ts")],
      },
    ],
  },
  {
    name: "type-only import of a global-effect file",
    code: `
      import type { Global } from "../effects/global";
      import { type Entry } from "../effects/entry";
      export type T = Global | Entry;
    `,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "alias import of a self-effect file",
    code: `import { self } from "effects/self";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "package import that resolves nowhere",
    code: `import { effects } from "effects";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "imports packages the registry does not list",
    code: `
      import React from "react";
      import cx from "classnames";
      import * as d3 from "d3";
      export const all = [React, cx, d3];
    `,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "type-only import of a listed package",
    code: `import type { DrawEvents } from "leaflet-draw";`,
    filename: IMPORTER,
    options: [registryOptions],
  },
  {
    name: "imports a listed package from a file in sideEffectPaths",
    code: `
      import { Draw } from "leaflet-draw";
      export { Draw };
    `,
    filename: REGISTRATION_FILE,
    options: [{ ...registryOptions, sideEffectPaths: [REGISTRATION_FILE] }],
  },
];

const INVALID_CASES = [
  {
    name: "member assignment on an import",
    code: `
      import { Popover as MantinePopover } from "@mantine/core";
      const Dropdown = () => null;
      MantinePopover.Dropdown = Dropdown;
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "call on an import",
    code: `
      import dayjs from "dayjs";
      import utc from "dayjs/plugin/utc";
      dayjs.extend(utc);
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "call on an import through a cast",
    code: `
      import dayjs from "dayjs";
      import utc from "dayjs/plugin/utc";
      dayjs.extend(utc) as unknown;
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "call on an import through parentheses and a non-null assertion",
    code: `
      import dayjs from "dayjs";
      import utc from "dayjs/plugin/utc";
      (dayjs.extend(utc))!;
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "optional call on an import",
    code: `
      import { maybeRegister } from "./registry";
      maybeRegister?.();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "window write",
    code: `window.foo = 1;`,
    errors: [{ messageId: "assignToGlobal" }],
  },
  {
    name: "globalThis write",
    code: `globalThis.x = 1;`,
    errors: [{ messageId: "assignToGlobal" }],
  },
  {
    name: "compound assignment on an import",
    code: `
      import { counters } from "./counters";
      counters.total += 1;
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "increment on an import",
    code: `
      import { counters } from "./counters";
      counters.total++;
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "delete on an import",
    code: `
      import { registry } from "./registry";
      delete registry.entry;
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "bare css import",
    code: `import "./x.css";`,
    errors: [{ messageId: "bareImport" }],
  },
  {
    name: "bare package import",
    code: `import "some-polyfill";`,
    errors: [{ messageId: "bareImport" }],
  },
  {
    name: "bare import of an unlisted sibling",
    code: `import "./register-something-else";`,
    filename: FILENAME,
    options,
    errors: [{ messageId: "bareImport" }],
  },
  {
    name: "bare import of a sibling of a listed side-effect directory",
    code: `import "../../api-client";`,
    filename: FILENAME,
    options,
    errors: [{ messageId: "bareImport" }],
  },
  {
    name: "Object.assign onto an import without an annotation",
    code: `
      import { Popover as MantinePopover } from "@mantine/core";
      const Dropdown = () => null;
      Object.assign(MantinePopover, { Dropdown });
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "Object.assign onto an import in an initializer",
    code: `
      import { Popover as MantinePopover } from "@mantine/core";
      const Dropdown = () => null;
      export const Popover = Object.assign(MantinePopover, { Dropdown });
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "Object.freeze on an import",
    code: `
      import { DEFAULTS } from "./defaults";
      Object.freeze(DEFAULTS);
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "imported registration function called as a statement",
    code: `
      import { registerX } from "./registry";
      registerX();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "same-file function called as a statement",
    code: `
      function registerX() {}
      registerX();
    `,
    errors: [{ messageId: "callAtModuleScope" }],
  },
  {
    name: "iife statement",
    code: `(() => { window.foo = 1; })();`,
    errors: [{ messageId: "callAtModuleScope" }],
  },
  {
    name: "guarded call",
    code: `
      import { registerX } from "./registry";
      const isDev = process.env.NODE_ENV !== "production";
      isDev && registerX();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "if at module scope",
    code: `
      import { registerX } from "./registry";
      if (typeof window !== "undefined") { registerX(); }
    `,
    errors: [{ messageId: "controlFlow", data: { kind: "if" } }],
  },
  {
    name: "for at module scope",
    code: `
      const items = [];
      for (const item of items) { items.push(item); }
    `,
    errors: [{ messageId: "controlFlow", data: { kind: "for" } }],
  },
  {
    name: "try at module scope",
    code: `try { JSON.parse("x"); } catch (e) {}`,
    errors: [{ messageId: "controlFlow", data: { kind: "try" } }],
  },
  {
    name: "top-level await",
    code: `
      import { load } from "./load";
      const data = await load();
    `,
    errors: [{ messageId: "topLevelAwait" }],
  },
  {
    name: "top-level await statement",
    code: `await Promise.resolve();`,
    errors: [{ messageId: "topLevelAwait" }],
  },
  {
    name: "export initialized from a package call",
    code: `
      import { registerThing } from "some-registry";
      export const thing = registerThing();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "package call nested in an object initializer",
    code: `
      import { registerThing } from "some-registry";
      export const things = { thing: registerThing(), list: [registerThing()] };
    `,
    errors: [{ messageId: "callOnImport" }, { messageId: "callOnImport" }],
  },
  {
    name: "package call nested in an object inside an array initializer",
    code: `
      import { registerThing } from "some-registry";
      export const things = [{ thing: registerThing() }];
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "package call in a jsx attribute",
    code: `
      import { registerThing } from "some-registry";
      export const DEFAULT = <div onClick={registerThing()} />;
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "delete inside a sequence",
    code: `
      import { registry } from "./registry";
      let step = 0;
      (step = 1, delete registry.entry);
    `,
    errors: [{ messageId: "assignToImport" }],
  },
  {
    name: "package call in a spread",
    code: `
      import { getDefaults } from "some-defaults";
      export const config = { ...getDefaults() };
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "push onto an imported list",
    code: `
      import { registry } from "./registry";
      registry.list.push({});
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "dom mutation",
    code: `
      const el = document.createElement("div");
      document.body.appendChild(el);
    `,
    errors: [{ messageId: "callAtModuleScope" }],
  },
  {
    name: "timer",
    code: `setTimeout(() => {}, 0);`,
    errors: [{ messageId: "callAtModuleScope" }],
  },
  {
    name: "dynamic import",
    code: `import("./heavy");`,
    errors: [{ messageId: "callAtModuleScope" }],
  },
  {
    name: "alias import not listed as internal",
    code: `
      import { registerThing } from "metabase/registry";
      export const thing = registerThing();
    `,
    options: [{ internalModules: ["metabase-lib"] }],
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "relative import called as a statement",
    code: `
      import { registerThing } from "./registry";
      registerThing();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "unallowlisted name from an allowlisted module",
    code: `
      import { registerCustomThing } from "@mantine/core";
      export const thing = registerCustomThing();
    `,
    errors: [{ messageId: "callOnImport" }],
  },
  {
    name: "imports a global-effect file",
    code: `import { global } from "../effects/global";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffect" }],
  },
  {
    name: "imports an entry",
    code: `import entry from "../effects/entry";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffect" }],
  },
  {
    name: "imports an unclassified file",
    code: `import * as unclassified from "../effects/unclassified";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffect" }],
  },
  {
    name: "alias import of a global-effect file",
    code: `import { global } from "effects/global";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffect" }],
  },
  {
    name: "value import beside a type import of a global-effect file",
    code: `import { type Global, global } from "../effects/global";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffect" }],
  },
  {
    name: "imports a listed package with bindings",
    code: `import { Draw } from "leaflet-draw";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffectPackage" }],
  },
  {
    name: "bare import of a listed package",
    code: `import "@mantine/core/styles.css";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffectPackage" }],
  },
  {
    name: "bare import of a subpath of a listed package",
    code: `import "leaflet-draw/dist/leaflet.draw.css";`,
    filename: IMPORTER,
    options: [registryOptions],
    errors: [{ messageId: "importsGlobalEffectPackage" }],
  },
  {
    name: "extra pure callee only allows the listed name",
    code: `
      import dayjs from "dayjs";
      import utc from "dayjs/plugin/utc";
      dayjs.extend(utc);
    `,
    options: [{ pureCallees: [{ module: "dayjs", names: ["default"] }] }],
    errors: [{ messageId: "callOnImport" }],
  },
];

ruleTester.run("no-module-side-effects", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES,
});
