import { RuleTester } from "eslint";

import noLiteralMetabaseString from "../eslint-rules/no-literal-metabase-strings";

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

const VALID_CASES = [
  {
    // "Metabase in import sources"
    code: `
import OpenInMetabase from "../components/OpenInMetabase";`,
  },
  {
    // "Metabase in reexports"
    code: `
export { MetabaseLinksToggleWidget } from "./MetabaseLinksToggleWidget";`,
  },
  {
    // "No Metabase string",
    code: `
  const label = "some string"`,
  },
  {
    // "Detect disabled rule next line",
    code: `
  function MyComponent() {
    // eslint-disable-next-line no-literal-metabase-strings -- In admin settings
    return <div>Metabase store {"interpolation"} something else</div>;
  }`,
  },
];

const INVALID_CASES = [
  {
    name: "Detect in literal strings",
    code: `
  const label = "Metabase blabla"`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in literal strings",
    code: `
  function MyComponent() {
    return <AnotherComponent label="Hello Metabase" />;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in literal strings",
    code: `
  import { getApplicationName } from 'metabase/selectors/whitelabel';

  const label = "Metabase blabla"`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in literal strings",
    code: `
  import { getApplicationName } from 'metabase/selectors/whitelabel';

  function MyComponent() {
    return <AnotherComponent label="Hello Metabase" />;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in template strings",
    code: `
  const label = t\`Metabase blabla\``,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in template strings",
    code: `
  function MyComponent() {
    return <AnotherComponent label={t\`Hello Metabase\`} />;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in template strings",
    code: `
  import { getApplicationName } from 'metabase/selectors/whitelabel';

  const label = t\`Metabase blabla\``,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in template strings",
    code: `
  import { getApplicationName } from 'metabase/selectors/whitelabel';

  function MyComponent() {
    return <AnotherComponent label={t\`Hello Metabase\`} />;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in JSX tags",
    code: `
  function MyComponent() {
    return <div>Metabase store {"interpolation"} something else</div>;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect in JSX tags",
    code: `
  import { getApplicationName } from 'metabase/selectors/whitelabel';

  function MyComponent() {
    return <div>Metabase store {"interpolation"} something else</div>;
  }`,
    error: /Metabase string must not be used directly./,
  },
  {
    name: "Detect disabled rule next line",
    code: `
  function MyComponent() {
    // eslint-disable-next-line no-literal-metabase-strings
    return <div>Metabase store {"interpolation"} something else</div>;
  }`,
    error:
      /Please add comment to indicate the reason why this rule needs to be disabled./,
  },
  {
    name: "Detect disabled rule block",
    code: `
  /* eslint-disable no-literal-metabase-strings */
  function MyComponent() {
    return <div>Metabase store {"interpolation"} something else</div>;
  }`,
    error: "Please use inline disable with comments instead.",
  },
];

ruleTester.run("no-literal-metabase-strings", noLiteralMetabaseString, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map(invalidCase => {
    return {
      code: invalidCase.code,
      errors: [
        {
          message: invalidCase.error,
        },
      ],
    };
  }),
});
