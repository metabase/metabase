import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/no-module-level-memoize";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const error = { messageId: "noModuleLevelMemoize" };
const FILE = "/repo/frontend/src/metabase/thing/new-file.ts";
const UTIL_NEIGHBOUR = "/repo/frontend/src/metabase/utils/thing.ts";

const IMPORT = 'import { memoize } from "metabase/utils/memoize";';

ruleTester.run("no-module-level-memoize", rule, {
  valid: [
    {
      name: "inside a plain function",
      filename: FILE,
      code: `
        ${IMPORT}
        export function build(rows) {
          const format = memoize((value) => String(value));
          return rows.map(format);
        }
      `,
    },
    {
      name: "inside a useMemo callback",
      filename: FILE,
      code: `
        ${IMPORT}
        import { useMemo } from "react";
        export function useThing(validate) {
          return useMemo(() => ({ validate: memoize(validate) }), [validate]);
        }
      `,
    },
    {
      name: "a class field initializer is per instance",
      filename: FILE,
      code: `
        ${IMPORT}
        export class Question {
          getParameters = memoize(() => []);
        }
      `,
    },
    {
      name: "inside a constructor",
      filename: FILE,
      code: `
        ${IMPORT}
        export class Table {
          constructor() {
            this.fieldsLookup = memoize(this.fieldsLookup);
          }
        }
      `,
    },
    {
      name: "inside an arrow returned by a factory",
      filename: FILE,
      code: `
        ${IMPORT}
        export const createFormatter = () => memoize((value) => String(value));
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
      name: "module scope",
      filename: FILE,
      code: `
        ${IMPORT}
        export const f = memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope with a renamed import",
      filename: FILE,
      code: `
        import { memoize as cache } from "metabase/utils/memoize";
        export const f = cache((x) => x);
      `,
      errors: [error],
    },
    {
      name: "module scope inside an object literal",
      filename: FILE,
      code: `
        ${IMPORT}
        export const definition = {
          getValue: memoize((series) => series),
        };
      `,
      errors: [error],
    },
    {
      name: "imported relatively from inside utils",
      filename: UTIL_NEIGHBOUR,
      code: `
        import { memoize } from "./memoize";
        export const f = memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "every module scope call is reported",
      filename: FILE,
      code: `
        ${IMPORT}
        export const f = memoize((x) => x);
        export const g = memoize((y) => y);
      `,
      errors: [error, error],
    },
  ],
});
