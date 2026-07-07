import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-unjustified-type-casts";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const errorMessage = /Type casts .* must be preceded by a comment/;

const VALID_CASES = [
  // Comment on the line above the statement.
  {
    name: "line comment above statement",
    code: `
      // value comes from an untyped source
      const x = value as Foo;
    `,
  },
  {
    name: "block comment above statement",
    code: `
      /* value comes from an untyped source */
      const x = value as Foo;
    `,
  },
  // Inline comment immediately before the cast expression.
  {
    name: "inline block comment before cast",
    code: `const x = /* safe */ value as Foo;`,
  },
  {
    name: "inline comment before nested cast",
    code: `doThing(/* safe */ value as Foo);`,
  },
  // Comment above a statement that wraps a nested cast.
  {
    name: "comment above statement wrapping nested cast",
    code: `
      // reason
      return callback(value as Foo);
    `,
  },
  // as const never requires a comment.
  {
    name: "as const literal",
    code: `const x = { a: 1 } as const;`,
  },
  {
    name: "as const on array",
    code: `const x = [1, 2, 3] as const;`,
  },
  // Chained casts only need one comment (on the outermost).
  {
    name: "chained cast with single comment",
    code: `
      // definitely safe
      const x = value as unknown as Foo;
    `,
  },
  // No casts at all.
  {
    name: "no cast",
    code: `const x = value;`,
  },
  {
    name: "satisfies is not a cast",
    code: `const x = value satisfies Foo;`,
  },
];

const INVALID_CASES = [
  {
    name: "simple cast without comment",
    code: `const x = value as Foo;`,
    errors: [{ message: errorMessage }],
  },
  {
    name: "cast in call argument without comment",
    code: `doThing(value as Foo);`,
    errors: [{ message: errorMessage }],
  },
  {
    name: "return cast without comment",
    code: `function f() { return value as Foo; }`,
    errors: [{ message: errorMessage }],
  },
  {
    name: "chained cast reported once",
    code: `const x = value as unknown as Foo;`,
    errors: [{ message: errorMessage }],
  },
  {
    name: "trailing comment does not justify the cast",
    code: `const x = value as Foo; // this comment is after the cast`,
    errors: [{ message: errorMessage }],
  },
  {
    name: "comment separated by a blank line does not justify",
    code: `
      // far away comment

      const x = value as Foo;
    `,
    errors: [{ message: errorMessage }],
  },
  {
    name: "two independent casts each need a comment",
    code: `
      const a = one as Foo;
      const b = two as Bar;
    `,
    errors: [{ message: errorMessage }, { message: errorMessage }],
  },
];

ruleTester.run("no-unjustified-type-casts", rule, {
  valid: VALID_CASES.map(({ code }) => ({ code })),
  invalid: INVALID_CASES.map(({ code, errors }) => ({ code, errors })),
});
