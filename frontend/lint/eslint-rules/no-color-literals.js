/**
 * @fileoverview Rule to disallow color literals
 * @author Tom Robinson
 */

"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const COLOR_REGEX = /(?:#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?\b|(?:rgb|hsl)a?\(\s*\d+\s*(?:,\s*\d+(?:\.\d+)?%?\s*){2,3}\))/g;
const LINT_MESSAGE =
  "Color literals forbidden. Import colors from 'metabase/lib/colors'.";

module.exports = {
  meta: {
    docs: {
      description: "disallow color literals",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [], // no options
  },
  create: function(context) {
    return {
      Literal(node) {
        if (typeof node.value === "string" && COLOR_REGEX.test(node.value)) {
          context.report({ node, message: LINT_MESSAGE });
        }
      },
      TemplateLiteral(node) {
        if (node.quasis.filter(q => COLOR_REGEX.test(q.value.raw)).length > 0) {
          context.report({ node, message: LINT_MESSAGE });
        }
      },
    };
  },
};
