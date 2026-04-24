/**
 * @fileoverview Rule that restricts `trackSchemaEvent` and `trackSimpleEvent`
 * imports from `metabase/analytics` to files named `analytics.{ts,tsx,js,jsx}`.
 *
 * Every Snowplow event must be wrapped in a feature-local `analytics.ts` so
 * tracking stays auditable and each feature owns the shape of its events.
 * Other exports from the barrel (`createSnowplowTracker`, `trackPageView`) are
 * infrastructure and may be imported anywhere.
 */

const BARREL = "metabase/analytics";
const FORBIDDEN_SPECIFIERS = new Set(["trackSchemaEvent", "trackSimpleEvent"]);

const errorMessage = (name) =>
  `importing \`${name}\` from "${BARREL}" is only allowed in files named "analytics". Please create a type-safe wrapper in an analytics.ts file and call that wrapper from your component or module.`;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: `Restrict ${[...FORBIDDEN_SPECIFIERS].join(" and ")} imports from "${BARREL}" to analytics.ts files.`,
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const baseFilename = filename.split("/").pop() || "";
    const isAnalyticsFile = /^analytics\.(ts|tsx|js|jsx)$/.test(baseFilename);

    if (isAnalyticsFile) {
      return {};
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== BARREL) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            FORBIDDEN_SPECIFIERS.has(specifier.imported.name)
          ) {
            context.report({
              node: specifier,
              message: errorMessage(specifier.imported.name),
            });
          }
        }
      },
    };
  },
};
