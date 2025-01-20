import { RuleTester } from "eslint";

import noLocaleWithIntlFunctions from "../eslint-rules/no-locale-with-intl-functions";

const ruleTester = new RuleTester({
  parserOptions: {
    ecmaVersion: 2015,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
});

const VALID_CASES = [
  {
    code: `'a'.localeCompare('b');`,
  },
  {
    code: `new Intl.NumberFormat().format(1000);`,
  },
  {
    code: `new Intl.DateTimeFormat().format(Date.now());`,
  },
  {
    code: `new Intl.RelativeTimeFormat().format(3, 'seconds')`,
  },
  {
    code: `new Intl.ListFormat().format(['Alice', 'Bob'])`,
  },
  {
    code: `new Intl.Segmenter().segment('a')[Symbol.iterator]().next()`,
  },
  {
    code: `new Intl.Collator().compare('a', 'b')`,
  },
];

const INVALID_CASES = [
  {
    name: "String.localeCompare should not take a locales argument",
    code: `"a".localeCompare("b", "en")`,
    error: /Avoid providing a locales argument to String.localeCompare/,
  },
  {
    name: "Intl.NumberFormat should not take a locales argument",
    code: `Intl.NumberFormat("en").format(1000);`,
    error: /Avoid providing a locales argument to Intl.NumberFormat/,
  },
  {
    name: "Intl.DateTimeFormat should not take a locales argument",
    code: `Intl.DateTimeFormat("en").format(Date.now());`,
    error: /Avoid providing a locales argument to Intl.DateTimeFormat/,
  },
  {
    name: "Intl.RelativeTimeFormat should not take a locales argument",
    code: `Intl.RelativeTimeFormat("en").format(3, 'seconds')`,
    error: /Avoid providing a locales argument to Intl.RelativeTimeFormat/,
  },
  {
    name: "Intl.ListFormat should not take a locales argument",
    code: `new Intl.ListFormat('en').format(['Alice', 'Bob'])`,
    error: /Avoid providing a locales argument to Intl.ListFormat/,
  },
  {
    name: "Intl.Segmenter should not take a locales argument",
    code: `new Intl.Segmenter('en').segment('a')[Symbol.iterator]().next()`,
    error: /Avoid providing a locales argument to Intl.Segmenter/,
  },
  {
    name: "Intl.Collator should not take a locales argument",
    code: `new Intl.Collator('en').compare('a', 'b')`,
    error: /Avoid providing a locales argument to Intl.Collator/,
  },
  {
    name: "Intl.DisplayNames cannot be called",
    code: `new Intl.DisplayNames()`,
    error: /Intl.DisplayNames is not supported in Metabase/,
  },
];

ruleTester.run("no-locale-with-intl-functions", noLocaleWithIntlFunctions, {
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
