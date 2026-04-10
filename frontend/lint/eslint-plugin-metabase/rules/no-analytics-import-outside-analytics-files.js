/**
 * @fileoverview Rule to ensure imports from metabase/utils/analytics only occur in files named "analytics.ts/tsx/js/jsx"
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const ERROR_MESSAGE =
  'Imports from "metabase/utils/analytics" are only allowed in files named "analytics", Please create a type-safe wrapper for the analytics functions in an analytics.ts file, and call that function from your component or module.';

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure imports from metabase/utils/analytics only occur in analytics files",
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

        // Check if importing from metabase/utils/analytics
        if (
          typeof sourceValue === "string" &&
          sourceValue === "metabase/utils/analytics"
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
