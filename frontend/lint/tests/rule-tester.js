import { RuleTester } from "oxlint/plugins-dev";

// `lang` parses every case without a filename as TSX. A case that sets `filename`
// takes its language from the extension instead.
export function createRuleTester() {
  return new RuleTester({
    languageOptions: {
      sourceType: "module",
      parserOptions: { lang: "tsx" },
    },
  });
}
