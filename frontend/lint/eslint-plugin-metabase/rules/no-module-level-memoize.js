/**
 * @fileoverview Rule to prevent memoization at module scope, where the cache
 * lives for the life of the tab.
 */

const HOUSE_MEMOIZE = "metabase/utils/memoize";

const MESSAGE = [
  "A memoize built at module scope lives for the life of the tab.",
  "It releases an entry once that entry's object arguments are gone, so a cache",
  "keyed only on strings or numbers never releases at all.",
  "Give the cache a lifetime that matches the work: build it inside the",
  "function, component or instance that uses it, or key a WeakMap on the",
  "long-lived object the result belongs to.",
].join(" ");

function isHouseMemoize(source, filename) {
  if (source === HOUSE_MEMOIZE) {
    return true;
  }

  // The helper's own neighbours import it relatively.
  return (
    /^\.{1,2}\/memoize$/.test(source) &&
    filename.split("\\").join("/").includes("/metabase/utils/")
  );
}

/**
 * True when the call runs once, as the module is evaluated. A call inside a
 * function, a component render, a class field or a constructor builds a fresh
 * cache per call, which is released with whatever owns it.
 */
function runsAtModuleScope(scope) {
  const { type } = scope.variableScope;
  return type === "module" || type === "global";
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow unbounded memoization at module scope",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noModuleLevelMemoize: MESSAGE,
    },
  },
  create(context) {
    const memoizeNames = new Set();

    return {
      ImportDeclaration(node) {
        if (!isHouseMemoize(node.source.value, context.filename)) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.name === "memoize"
          ) {
            memoizeNames.add(specifier.local.name);
          }
        }
      },

      "CallExpression > Identifier.callee"(node) {
        if (
          memoizeNames.has(node.name) &&
          runsAtModuleScope(context.sourceCode.getScope(node))
        ) {
          context.report({ node, messageId: "noModuleLevelMemoize" });
        }
      },
    };
  },
};
