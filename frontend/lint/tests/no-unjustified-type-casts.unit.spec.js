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
  // Comment above a statement wrapping a cast that sits on the statement's
  // first line — the comment is directly above the cast's line.
  {
    name: "comment above statement wrapping same-line cast",
    code: `
      // reason
      return callback(value as Foo);
    `,
  },
  // Comment directly above a cast nested deep inside a multiline statement.
  {
    name: "comment above a nested cast on its own line",
    code: `
      const obj = {
        // reason
        a: value as Foo,
      };
    `,
  },
  // Comment above a cast that is the arrow function's returned value.
  {
    name: "comment above an arrow-returned cast",
    code: `
      const getGraph = () =>
        // reason
        ({ a: value }) as Foo;
    `,
  },
  // Comment above a cast used as a function-call argument property.
  {
    name: "comment above a cast in a call argument property",
    code: `
      foo({
        // reason
        id: value as unknown as number,
      });
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
  // A comment above the enclosing statement does NOT justify a cast that lives
  // several lines below it — the comment must sit next to the cast's line.
  {
    name: "comment above statement but not above the nested cast line",
    code: `
      // reason
      const obj = {
        a: value as Foo,
      };
    `,
    errors: [{ message: errorMessage }],
  },
  {
    name: "comment above the arrow declaration but not above the returned cast",
    code: `
      // reason
      const getGraph = () =>
        ({ a: value }) as Foo;
    `,
    errors: [{ message: errorMessage }],
  },
  {
    name: "comment above the call but not above the cast argument",
    code: `
      // reason
      foo({
        id: value as unknown as number,
      });
    `,
    errors: [{ message: errorMessage }],
  },
];

ruleTester.run("no-unjustified-type-casts", rule, {
  valid: VALID_CASES.map(({ code }) => ({ code })),
  invalid: INVALID_CASES.map(({ code, errors }) => ({ code, errors })),
});
