import { createRequire } from "node:module";
import plugin from "eslint-plugin-import-x";
import { wrap } from "../plugin.mjs";
import { resolver } from "../resolver.mjs";

const require = createRequire(import.meta.url);
// export * analysis parses dependency files. Oxlint's context.parser is a stub;
// load the existing parser only when import-x actually needs to parse a module.
const parser = (typescript) => ({
  meta: {
    name: typescript ? "typescript-eslint/parser" : "babel/eslint-parser",
  },
  parseForESLint(code, options) {
    const implementation = typescript
      ? require("typescript-eslint").parser
      : require("@babel/eslint-parser");
    return implementation.parseForESLint(code, options);
  },
});
const tsParser = parser(true);
const jsParser = parser(false);
export default wrap("import-js", plugin, resolver.importSettings, (context) =>
  Object.create(context, {
    languageOptions: {
      value: {
        ...context.languageOptions,
        parser: /\.[cm]?tsx?$/.test(context.filename) ? tsParser : jsParser,
      },
    },
  }),
);
