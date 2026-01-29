/**
 * @fileoverview Rule to prevent importing reinitialize functions from OSS plugin files
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ERROR_MESSAGE =
  'Direct import of "reinitialize" from OSS plugin files is not allowed. Reinitializing all plugins at once from "metabase/plugins/index.ts" is the way.';

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing reinitialize functions from OSS plugin files",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noReinitializeImport: ERROR_MESSAGE,
    },
  },
  create(context) {
    const filename = context.getFilename();

    // Allow imports in the main plugins index file
    if (filename.endsWith("metabase/plugins/index.ts")) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        const sourceValue = node.source.value;

        // Check if importing from an OSS plugin file
        if (
          typeof sourceValue === "string" &&
          sourceValue.startsWith("metabase/plugins/oss/")
        ) {
          // Check if importing 'reinitialize'
          const reinitializeImport = node.specifiers.find(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              specifier.imported.name === "reinitialize",
          );

          if (reinitializeImport) {
            context.report({
              node: reinitializeImport,
              message: ERROR_MESSAGE,
            });
          }
        }
      },
    };
  },
};
