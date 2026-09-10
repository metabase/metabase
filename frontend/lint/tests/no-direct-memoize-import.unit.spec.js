import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/no-direct-memoize-import";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const error = { messageId: "noDirectMemoizeImport" };
const FILE = "/repo/frontend/src/metabase/thing/new-file.ts";
const HOUSE_MODULE = "/repo/frontend/src/metabase/utils/memoize.ts";

ruleTester.run("no-direct-memoize-import", rule, {
  valid: [
    {
      name: "the house helper",
      filename: FILE,
      code: `
        import { memoize } from "metabase/utils/memoize";
        export const f = memoize((x) => x);
      `,
    },
    {
      name: "other underscore helpers",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const picked = _.pick({ a: 1 }, "a");
      `,
    },
    {
      name: "other toolkit exports",
      filename: FILE,
      code: `
        import { createSelector } from "@reduxjs/toolkit";
        export const s = createSelector([(x) => x], (x) => x);
      `,
    },
    {
      name: "the house module may reach for the implementation",
      filename: HOUSE_MODULE,
      code: `export { weakMapMemoize as memoize } from "@reduxjs/toolkit";`,
    },
    {
      name: "a memoize method on something else",
      filename: FILE,
      code: `
        import cache from "./cache";
        export const f = cache.memoize((x) => x);
      `,
    },
  ],
  invalid: [
    {
      name: "underscore namespace access",
      filename: FILE,
      code: `
        import _ from "underscore";
        export const f = _.memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "underscore named import",
      filename: FILE,
      code: `
        import { memoize } from "underscore";
        export const f = memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "underscore renamed import",
      filename: FILE,
      code: `
        import { memoize as underscoreMemoize } from "underscore";
        export const f = underscoreMemoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "weakMapMemoize from the toolkit",
      filename: FILE,
      code: `
        import { weakMapMemoize } from "@reduxjs/toolkit";
        export const f = weakMapMemoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "lruMemoize from reselect",
      filename: FILE,
      code: `
        import { lruMemoize } from "reselect";
        export const f = lruMemoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "underscore memoize used off module scope is still the wrong door",
      filename: FILE,
      code: `
        import _ from "underscore";
        export function build() {
          return _.memoize((x) => x);
        }
      `,
      errors: [error],
    },
  ],
});
