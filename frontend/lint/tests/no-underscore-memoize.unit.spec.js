import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/no-underscore-memoize";
import allowlist from "../underscore-memoize-allowlist";

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const error = { messageId: "noUnderscoreMemoize" };

const NEW_FILE = "/repo/frontend/src/metabase/thing/new-file.ts";
const ALLOWED_FILE = `/repo/${allowlist[0]}`;

ruleTester.run("no-underscore-memoize", rule, {
  valid: [
    {
      name: "memoize from our own util",
      filename: NEW_FILE,
      code: `
        import { memoize } from "metabase/utils/memoize";
        const f = memoize((x) => x);
      `,
    },
    {
      name: "other underscore helpers",
      filename: NEW_FILE,
      code: `
        import _ from "underscore";
        const picked = _.pick({ a: 1 }, "a");
      `,
    },
    {
      name: "an unrelated local named memoize",
      filename: NEW_FILE,
      code: `
        const memoize = (fn) => fn;
        const f = memoize((x) => x);
      `,
    },
    {
      name: "a method called memoize on something else",
      filename: NEW_FILE,
      code: `
        import cache from "./cache";
        const f = cache.memoize((x) => x);
      `,
    },
    {
      name: "an allowlisted file may keep its existing call",
      filename: ALLOWED_FILE,
      code: `
        import _ from "underscore";
        const f = _.memoize((x) => x);
      `,
    },
  ],
  invalid: [
    {
      name: "namespace call",
      filename: NEW_FILE,
      code: `
        import _ from "underscore";
        const f = _.memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "named import",
      filename: NEW_FILE,
      code: `
        import { memoize } from "underscore";
        const f = memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "renamed named import",
      filename: NEW_FILE,
      code: `
        import { memoize as underscoreMemoize } from "underscore";
        const f = underscoreMemoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "a renamed namespace import",
      filename: NEW_FILE,
      code: `
        import underscore from "underscore";
        const f = underscore.memoize((x) => x);
      `,
      errors: [error],
    },
    {
      name: "every call is reported",
      filename: NEW_FILE,
      code: `
        import _ from "underscore";
        const f = _.memoize((x) => x);
        const g = _.memoize((y) => y);
      `,
      errors: [error, error],
    },
  ],
});

describe("underscore memoize allowlist", () => {
  it("only lists repo-relative frontend paths", () => {
    allowlist.forEach((entry) => {
      expect(entry).toMatch(/^(frontend|enterprise\/frontend)\/src\/.*\.tsx?$/);
    });
  });

  it("has no duplicates", () => {
    expect(new Set(allowlist).size).toBe(allowlist.length);
  });
});
