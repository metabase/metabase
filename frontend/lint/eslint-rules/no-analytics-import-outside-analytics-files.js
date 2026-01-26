/**
 * @fileoverview Rule to ensure imports from metabase/lib/analytics only occur in files named "analytics.ts/tsx/js/jsx"
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ERROR_MESSAGE =
  'Imports from "metabase/lib/analytics" are only allowed in files named "analytics", Please move this import to an analytics file.';

// eslint-disable-next-line import/no-commonjs
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure imports from metabase/lib/analytics only occur in analytics files",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noAnalyticsImportOutsideAnalyticsFile: ERROR_MESSAGE,
    },
  },
  create(context) {
    const filename = context.getFilename();

    // Get the base filename without path
    const baseFilename = filename.split("/").pop() || "";

    // Check if the file is an analytics file
    const isAnalyticsFile = /^analytics\.(ts|tsx|js|jsx)$/.test(baseFilename);

    return {
      ImportDeclaration(node) {
        const sourceValue = node.source.value;

        // Check if importing from metabase/lib/analytics
        if (
          typeof sourceValue === "string" &&
          sourceValue === "metabase/lib/analytics"
        ) {
          // If not in an analytics file, report an error
          if (!isAnalyticsFile) {
            context.report({
              node,
              message: ERROR_MESSAGE,
            });
          }
        }
      },
    };
  },
};
