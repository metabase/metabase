/**
 * @fileoverview Rule that restricts `trackSchemaEvent` and `trackSimpleEvent`
 * imports from `metabase/analytics` to files named `analytics.{ts,tsx,js,jsx}`
 * or files inside an `analytics/` directory.
 *
 * Every Snowplow event must be wrapped in a feature-local `analytics.ts` (or
 * a file inside an `analytics/` folder) so tracking stays auditable and each
 * feature owns the shape of its events. Other exports from the barrel
 * (`createSnowplowTracker`, `trackPageView`) are infrastructure and may be
 * imported anywhere.
 */

const BARREL = "metabase/analytics";
const FORBIDDEN_SPECIFIERS = new Set(["trackSchemaEvent", "trackSimpleEvent"]);

const errorMessage = (name) =>
  `importing \`${name}\` from "${BARREL}" is only allowed in files named "analytics" or inside an "analytics/" directory. Please create a type-safe wrapper in an analytics.ts file (or under an analytics/ folder) and call that wrapper from your component or module.`;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: `Restrict ${[...FORBIDDEN_SPECIFIERS].join(" and ")} imports from "${BARREL}" to analytics.ts files or files inside an analytics/ directory.`,
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    const segments = filename.split("/");
    const baseFilename = segments[segments.length - 1] || "";
    const isAnalyticsFile = /^analytics\.(ts|tsx|js|jsx)$/.test(baseFilename);
    const isInAnalyticsDir = segments.slice(0, -1).includes("analytics");

    if (isAnalyticsFile || isInAnalyticsDir) {
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
