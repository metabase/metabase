/**
 * @fileoverview Rule to disallow base color tokens in application code.
 *
 * Replaces the `no-restricted-syntax` selector
 * `Literal[value=/mb-base-color-/]` from the ESLint config. oxlint does not
 * implement `no-restricted-syntax`, so the ban lives here instead.
 */

const BASE_COLOR_REGEX = /mb-base-color-/;
const LINT_MESSAGE =
  "You may not use base colors in the application, use semantic colors instead. (see colors.module.css)";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow base color tokens in favour of semantic colors",
      category: "Possible Errors",
      recommended: true,
    },
    schema: [], // no options
  },
  create: function (context) {
    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          BASE_COLOR_REGEX.test(node.value)
        ) {
          context.report({ node, message: LINT_MESSAGE });
        }
      },
      TemplateLiteral(node) {
        if (node.quasis.some((q) => BASE_COLOR_REGEX.test(q.value.raw))) {
          context.report({ node, message: LINT_MESSAGE });
        }
      },
    };
  },
};
