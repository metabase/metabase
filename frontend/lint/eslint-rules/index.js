const noColorLiterals = require("./no-color-literals.js");
const noUnconditionalMetabaseLinksRender = require("./no-unconditional-metabase-links-render.js");
const noLiteralMetabaseStrings = require("./no-literal-metabase-strings.js");
const noUnscopedTextSelectors = require("./no-unscoped-text-selectors.js");

module.exports = {
  rules: {
    "no-color-literals": noColorLiterals,
    "no-unconditional-metabase-links-render": noUnconditionalMetabaseLinksRender,
    "no-literal-metabase-strings": noLiteralMetabaseStrings,
    "no-unscoped-text-selectors": noUnscopedTextSelectors,
  },
};