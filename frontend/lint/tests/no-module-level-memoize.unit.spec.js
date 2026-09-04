import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/no-module-level-memoize";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: false } },
  },
});

const error = { messageId: "noModuleLevelUnderscoreMemoize" };
const utilError = { messageId: "noModuleLevelUtilMemoize" };
const UTIL_FILE = "/repo/frontend/src/metabase/utils/thing.ts";
const FILE = "/repo/frontend/src/metabase/thing/new-file.ts";

ruleTester.run("no-module-level-memoize", rule, {
  valid: [
    {
      name: "inside a plain function",
      filename: FILE,
      code: `
        import _ from "underscore";
        export function build(rows) {
          const format = _.memoize((value) => String(value));
          return rows.map(format);
        }
      `,
    },
    {
      name: "inside a useMemo callback",
      filename: FILE,
      code: `
        import _ from "underscore";
        import { useMemo } from "react";
        export function useThing(validate) {
          return useMemo(() => ({ validate: _.memoize(validate) }), [validate]);
        }
      `,
    },
    {
      name: "a class field initializer is per instance",
      filename: FILE,
      code: `
        import _ from "underscore";
        export class Question {
          getParameters = _.memoize(() => []);
        }
      `,
    },
    {
      name: "inside a constructor",
      filename: FILE,
      code: `
        import _ from "underscore";
        export class Table {
          constructor() {
            this.fieldsLookup = _.memoize(this.fieldsLookup);
          }
        }
      `,
    },
    {
      name: "inside an arrow returned by a factory",
      filename: FILE,
      code: `
        import { memoize } from "underscore";
        export const createFormatter = () => memoize((value) => String(value));
      `,
    },
    {
      name: "our own util inside a function",
      filename: FILE,
      code: `
        import { memoize } from "metabase/utils/memoize";
        export function build() {
          return memoize((x) => x);
        }
      `,
    },
    {
      name: "memoizeClass at module scope is keyed on the instance",
      filename: FILE,
      code: `
        import { memoizeClass } from "metabase/utils/memoize";
        export const Wrapped = memoizeClass("render")(Thing);
      `,
    },
    {
      name: "an unrelated module that happens to be named memoize",
      filename: "/repo/frontend/src/metabase/other/place.ts",
      code: `
        import { memoize } from "./memoize";
        export const f = memoize((x) => x);
      `,
    },
    {
      name: "other underscore helpers at module scope",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const picked = _.pick({ a: 1 }, "a");
      `,
    },
    {
      name: "an unrelated local named memoize",
      filename: FILE,
      code: `
        const memoize = (fn) => fn;
        export const f = memoize((x) => x);
      `,
    },
  ],
  invalid: [
    {
      name: "our own util at module scope",
      filename: FILE,
      code: `
        import { memoize } from "metabase/utils/memoize";
        export const f = memoize((x) => x);
      `,
      errors: [utilError],
    },
    {
      name: "our own util imported relatively from inside utils",
      filename: UTIL_FILE,
      code: `
        import { memoize } from "./memoize";
        export const f = memoize((x) => x);
      `,
      errors: [utilError],
    },
    {
      name: "both sources in one file",
      filename: FILE,
      code: `
        import _ from "underscore";
        import { memoize } from "metabase/utils/memoize";
        export const f = _.memoize((x) => x);
        export const g = memoize((y) => y);
      `,
      errors: [error, utilError],
    },
    {
      name: "module scope namespace call",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const f = _.memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope named import",
      filename: FILE,
      code: `
        import { memoize } from "underscore";
        export const f = memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope renamed named import",
      filename: FILE,
      code: `
        import { memoize as underscoreMemoize } from "underscore";
        export const f = underscoreMemoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope renamed namespace import",
      filename: FILE,
      code: `
        import underscore from "underscore";
        export const f = underscore.memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope inside an object literal",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const definition = {
          getValue: _.memoize((series) => series),
        };
      `,
      errors: [error],
    },
    {
      name: "every module scope call is reported",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const f = _.memoize((x) => x);
        export const g = _.memoize((y) => y);
      `,
      errors: [error, error],
    },
  ],
});
