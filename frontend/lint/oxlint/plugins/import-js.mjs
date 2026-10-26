import { createRequire } from "node:module";
import plugin from "eslint-plugin-import-x";
import { wrap } from "../plugin.mjs";
import { resolver } from "../resolver.mjs";

const require = createRequire(import.meta.url);
// import-x needs a working parser for export * analysis.
// Oxlint supplies a stub.
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
      // Spreading languageOptions eagerly evaluates its AST and global getters.
      value: Object.create(context.languageOptions, {
        parser: {
          get: () =>
            /\.[cm]?tsx?$/.test(context.filename) ? tsParser : jsParser,
        },
      }),
    },
  }),
);
