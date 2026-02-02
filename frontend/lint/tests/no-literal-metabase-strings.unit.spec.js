import { RuleTester } from "eslint";

import noLiteralMetabaseString from "../eslint-rules/no-literal-metabase-strings";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
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
    // "Metabase in * reexports"
    code: `
export * from "./MetabaseLinksToggleWidget";`,
  },
  {
    // "No Metabase string",
    code: `
  const label = "some string"`,
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
];

ruleTester.run("no-literal-metabase-strings", noLiteralMetabaseString, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map((invalidCase) => ({
    code: invalidCase.code,
    errors: [{ message: invalidCase.error }],
  })),
});
