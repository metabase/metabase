/**
 * @fileoverview Rule to ensure imports from metabase/analytics only occur in files named "analytics.ts/tsx/js/jsx"
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const FORBIDDEN_IMPORT = "metabase/analytics";
const FORBIDDEN_SPECIFIERS = ["trackSchemaEvent", "trackSimpleEvent"];

const errorMessage = (name) =>
  `importing \`${name}\` from "${FORBIDDEN_IMPORT}" is only allowed in files named "analytics", Please create a type-safe wrapper for the analytics functions in an analytics.ts file, and call that function from your component or module.`;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure imports from metabase/analytics only occur in analytics files",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();

    // Get the base filename without path
    const baseFilename = filename.split("/").pop() || "";

    // Check if the file is an analytics file
    const isAnalyticsFile = /^analytics\.(ts|tsx|js|jsx)$/.test(baseFilename);

    return {
      ImportDeclaration(node) {
        if (isAnalyticsFile) {
          // we're in an analytics file so importing from analytics is fine
          return;
        }

        if (!node.source.value.startsWith(FORBIDDEN_IMPORT)) {
          // different module, ignore
          return;
        }

        for (const specifier of node.specifiers) {
          if (FORBIDDEN_SPECIFIERS.includes(specifier.imported.name)) {
            context.report({
              node: specifier.imported,
              message: errorMessage(specifier.imported.name),
            });
          }
        }
      },
    };
  },
};
