/**
 * @fileoverview Rule to disallow importing H from e2e/support or e2e/support/helpers
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ERROR_MESSAGE =
  'Do not import "H" from "e2e/support". use "const { H } = cy" instead.';

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing H directly from e2e support modules",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noHImport: ERROR_MESSAGE,
    },
    fixable: "code",
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (node.source.value === "e2e/support") {
          const hImportSpecifier = node.specifiers.find(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.imported.name === "H",
          );

          if (hImportSpecifier) {
            context.report({
              node,
              message: ERROR_MESSAGE,
              fix(fixer) {
                if (node.specifiers.length > 1) {
                  const start = hImportSpecifier.range[0];
                  const end = node.specifiers[
                    node.specifiers.indexOf(hImportSpecifier) + 1
                  ]
                    ? node.specifiers[node.specifiers.indexOf(hImportSpecifier)]
                        .range[1] + 1
                    : hImportSpecifier.range[1];

                  return [
                    fixer.removeRange([start, end]),
                    fixer.insertTextBefore(node, "const { H } = cy;"),
                  ];
                }

                return [
                  fixer.remove(node),
                  fixer.insertTextBefore(node, "const { H } = cy;"),
                ];
              },
            });
          }
        }
      },
    };
  },
};
