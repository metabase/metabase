import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/no-module-level-underscore-memoize";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: false } },
  },
});

const error = { messageId: "noModuleLevelUnderscoreMemoize" };
const FILE = "/repo/frontend/src/metabase/thing/new-file.ts";

ruleTester.run("no-module-level-underscore-memoize", rule, {
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
      name: "memoize from our own util at module scope",
      filename: FILE,
      code: `
        import { memoize } from "metabase/utils/memoize";
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
