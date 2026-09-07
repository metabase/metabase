import { RuleTester } from "oxlint/plugins-dev";

import rule from "../eslint-plugin-metabase/rules/no-unjustified-type-casts";

const TS_FILENAME = "spec.ts"; // Angle-bracket casts only parse with JSX off
const TSX_FILENAME = "spec.tsx";

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: "module",
  },
});

const message = /Type casts .* must be preceded by a comment/;

const VALID_CASES = [
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
  {
    name: "inline block comment before cast",
    code: `const x = /* safe */ value as Foo;`,
  },
  {
    name: "inline comment before nested cast",
    code: `doThing(/* safe */ value as Foo);`,
  },
  {
    name: "comment above statement wrapping same-line cast",
    code: `
      // reason
      return callback(value as Foo);
    `,
  },
  {
    name: "comment above a nested cast on its own line",
    code: `
      const obj = {
        // reason
        a: value as Foo,
      };
    `,
  },
  {
    name: "comment above an arrow-returned cast",
    code: `
      const getGraph = () =>
        // reason
        ({ a: value }) as Foo;
    `,
  },
  {
    name: "comment above a cast in a call argument property",
    code: `
      foo({
        // reason
        id: value as unknown as number,
      });
    `,
  },
  {
    name: "comment above the grouping paren of a parenthesized cast",
    code: `
      // reason
      (
        value as Foo
      ).doThing();
    `,
  },
  {
    name: "as const literal",
    code: `const x = { a: 1 } as const;`,
  },
  {
    name: "as const on array",
    code: `const x = [1, 2, 3] as const;`,
  },
  {
    name: "chained cast with single comment",
    code: `
      // definitely safe
      const x = value as unknown as Foo;
    `,
  },
  {
    name: "no cast",
    code: `const x = value;`,
  },
  {
    name: "satisfies is not a cast",
    code: `const x = value satisfies Foo;`,
  },
  {
    name: "angle-bracket cast with comment above",
    code: `
      // response comes from an untyped source
      const user = <User>response;
    `,
  },
  {
    name: "angle-bracket const assertion",
    code: `const x = <const>[1, 2, 3];`,
  },
  {
    name: "mixed angle-bracket and as chain with single comment",
    code: `
      // definitely safe
      const x = (<unknown>value) as Foo;
    `,
  },
  {
    name: "JSX comment on the line above a cast in JSX children",
    filename: TSX_FILENAME,
    code: `
      function C() {
        return (
          <ul>
            {/* reason */}
            <Icon name={value as Foo} />
          </ul>
        );
      }
    `,
  },
  {
    name: "inline comment inside a JSX expression container",
    filename: TSX_FILENAME,
    code: `
      function C() {
        return (
          <ul>
            <Icon name={/* reason */ value as Foo} />
          </ul>
        );
      }
    `,
  },
  {
    name: "comment above a JSX element on the statement line",
    filename: TSX_FILENAME,
    code: `
      function C() {
        // reason
        return <Icon name={value as Foo} />;
      }
    `,
  },
  {
    name: "ternary branch comments after the ?/: operators",
    code: `
      const id = isDashboard
        ? // reason
          (item as Dashboard).id
        : // reason
          (item as Question).id();
    `,
  },
];

const INVALID_CASES = [
  {
    name: "simple cast without comment",
    code: `const x = value as Foo;`,
    errors: [{ message }],
  },
  {
    name: "cast in call argument without comment",
    code: `doThing(value as Foo);`,
    errors: [{ message }],
  },
  {
    name: "return cast without comment",
    code: `function f() { return value as Foo; }`,
    errors: [{ message }],
  },
  {
    name: "chained cast reported once",
    code: `const x = value as unknown as Foo;`,
    errors: [{ message }],
  },
  {
    name: "trailing comment does not justify the cast",
    code: `const x = value as Foo; // this comment is after the cast`,
    errors: [{ message }],
  },
  {
    name: "comment separated by a blank line does not justify",
    code: `
      // far away comment

      const x = value as Foo;
    `,
    errors: [{ message }],
  },
  {
    name: "two independent casts each need a comment",
    code: `
      const a = one as Foo;
      const b = two as Bar;
    `,
    errors: [{ message }, { message }],
  },
  {
    name: "comment above statement but not above the nested cast line",
    code: `
      // reason
      const obj = {
        a: value as Foo,
      };
    `,
    errors: [{ message }],
  },
  {
    name: "comment above the arrow declaration but not above the returned cast",
    code: `
      // reason
      const getGraph = () =>
        ({ a: value }) as Foo;
    `,
    errors: [{ message }],
  },
  {
    name: "comment above the call but not above the cast argument",
    code: `
      // reason
      foo({
        id: value as unknown as number,
      });
    `,
    errors: [{ message }],
  },
  {
    name: "parenthesized cast without a comment",
    code: `
      (
        value as Foo
      ).doThing();
    `,
    errors: [{ message }],
  },
  {
    name: "angle-bracket cast without comment",
    code: `const user = <User>response;`,
    errors: [{ message }],
  },
  {
    name: "angle-bracket chained cast reported once",
    code: `const x = <Foo>(<unknown>value);`,
    errors: [{ message }],
  },
  {
    name: "trailing comment on the previous code line does not justify",
    code: `
      let x; // asd
      const y = value as Foo;
    `,
    errors: [{ message }],
  },
  {
    name: "trailing comment on a previous argument line does not justify",
    code: `
      foo(bar, // context
        value as Foo);
    `,
    errors: [{ message }],
  },
  {
    name: "comment after a single-line condition and ? does not justify",
    code: `
      const id = isDashboard ? // reason
        (item as Dashboard).id : other;
    `,
    errors: [{ message }],
  },
  {
    name: "comment above the statement does not justify a cast deeper in JSX",
    filename: TSX_FILENAME,
    code: `
      function C() {
        // too far from the cast
        return (
          <ul>
            <li>
              <Icon name={value as Foo} />
            </li>
          </ul>
        );
      }
    `,
    errors: [{ message }],
  },
  {
    name: "JSX comment two lines above the cast does not justify",
    filename: TSX_FILENAME,
    code: `
      function C() {
        return (
          <ul>
            {/* too far */}
            <li>filler</li>
            <Icon name={value as Foo} />
          </ul>
        );
      }
    `,
    errors: [{ message }],
  },
];

ruleTester.run("no-unjustified-type-casts", rule, {
  valid: VALID_CASES.map(({ code, filename }) => ({
    code,
    filename: filename ?? TS_FILENAME,
  })),
  invalid: INVALID_CASES.map(({ code, errors, filename }) => ({
    code,
    errors,
    filename: filename ?? TS_FILENAME,
  })),
});
