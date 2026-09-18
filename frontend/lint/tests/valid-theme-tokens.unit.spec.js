import { RuleTester } from "eslint";

import rule from "../eslint-plugin-metabase/rules/valid-theme-tokens";

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
    name: "Valid spacing tokens in JSX props",
    code: `<Box p="lg" mt="xxl" gap="sm" />;`,
  },
  {
    name: "Raw CSS values are allowed",
    code: `<Box p="1.5rem" maw="100%" radius="50%" h={32} />;`,
  },
  {
    name: "CSS keywords are allowed",
    code: `<Box maw="none" m="auto" display="none" />;`,
  },
  {
    name: "Valid tokens in responsive objects",
    code: `<Box p={{ base: "lg", sm: "xl" }} />;`,
  },
  {
    name: "Valid tokens in ternaries",
    code: `<Box mt={cond ? "none" : "lg"} />;`,
  },
  {
    name: "Theme and stock shadow tokens",
    code: `<div><Paper shadow="xs_outline" /><Paper shadow="md" /><Paper shadow="lg" /></div>;`,
  },
  {
    name: "Valid tokens in style and config objects",
    code: `const props = { padding: "lg", px: "xxl", radius: "xs", shadow: "sm_outline" };`,
  },
  {
    name: "Untyped props are ignored",
    code: `<Button variant="outline" color="brand" size="md" label="hello" />;`,
  },
  {
    name: "Non-string values are ignored",
    code: `<Box p={0} m={computeMargin()} w={getWidth()} />;`,
  },
  {
    name: "CSS property values that are not tokens",
    code: `const styles = { display: "flex", padding: "var(--x)", color: "red" };`,
  },
];

const INVALID_CASES = [
  {
    name: "Invalid shadow token in JSX",
    code: `<Paper shadow="lgg" />;`,
    errors: [{ message: /"lgg" is not a valid shadow token for "shadow"/ }],
  },
  {
    name: "Bare word on a spacing prop",
    code: `<Box p="bogus" />;`,
    errors: [{ message: /"bogus" is not a valid spacing token for "p"/ }],
  },
  {
    name: "Invalid token inside a responsive object",
    code: `<Box gap={{ base: "lg", sm: "loose" }} />;`,
    errors: [{ message: /"loose" is not a valid spacing token for "gap"/ }],
  },
  {
    name: "Invalid token in a ternary branch",
    code: `<Box mt={cond ? "none" : "bogus"} />;`,
    errors: [{ message: /"bogus" is not a valid spacing token for "mt"/ }],
  },
  {
    name: "Cross-family token in an object property",
    code: `const props = { pr: "xs_outline" };`,
    errors: [{ message: /"xs_outline" is not a valid spacing token for "pr"/ }],
  },
  {
    name: "Cross-family token as radius in an object property",
    code: `const styles = { borderRadius: "xs_outline" };`,
    errors: [
      {
        message: /"xs_outline" is not a valid radius token for "borderRadius"/,
      },
    ],
  },
  {
    name: "Invalid token in nested style slot object",
    code: `const styles = { root: { padding: "xl", boxShadow: "xxl" } };`,
    errors: [{ message: /"xxl" is not a valid shadow token for "boxShadow"/ }],
  },
];

ruleTester.run("valid-theme-tokens", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES,
});
