/**
 * @fileoverview Rule to prevent memoization at module scope, where the cache
 * lives for the life of the tab.
 */

const UNDERSCORE_MESSAGE = [
  "underscore's memoize never evicts and never releases: its cache is a plain",
  "object on the returned function. At module scope that cache lives for the",
  "life of the tab, and the key strings are retained with it.",
  "Give the cache a lifetime that matches the work: a Map created per call, a",
  "WeakMap keyed on a long-lived object, or a cache built inside the component",
  "or instance that uses it.",
].join(" ");

const UTIL_MESSAGE = [
  "memoize from metabase/utils/memoize roots its WeakMap on the function it",
  "wraps, so it only releases once that function does. At module scope the",
  "function lives for the life of the tab, and the nested Maps hold every",
  "argument ever passed.",
  "It is safe inside a function, a component render, or a constructor, where a",
  "fresh wrapper is created and released with its owner.",
].join(" ");

const UNDERSCORE = "underscore";
const MEMOIZE_UTIL = "metabase/utils/memoize";

function isMemoizeUtil(source, filename) {
  if (source === MEMOIZE_UTIL) {
    return true;
  }

  // The util's own neighbours import it relatively.
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
      noModuleLevelUnderscoreMemoize: UNDERSCORE_MESSAGE,
      noModuleLevelUtilMemoize: UTIL_MESSAGE,
    },
  },
  create(context) {
    // Local names bound to a memoize we care about, mapped to the messageId
    // that explains why that one is a problem.
    const memoizeNames = new Map();
    // Names bound to the underscore namespace, usually `_`.
    const namespaceImports = new Set();

    function reportIfModuleLevel(node, messageId) {
      if (runsAtModuleScope(context.sourceCode.getScope(node))) {
        context.report({ node, messageId });
      }
    }

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        const isUnderscore = source === UNDERSCORE;
        const isUtil = isMemoizeUtil(source, context.filename);

        if (!isUnderscore && !isUtil) {
          return;
        }

        const messageId = isUnderscore
          ? "noModuleLevelUnderscoreMemoize"
          : "noModuleLevelUtilMemoize";

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.name === "memoize"
          ) {
            memoizeNames.set(specifier.local.name, messageId);
          } else if (
            isUnderscore &&
            (specifier.type === "ImportDefaultSpecifier" ||
              specifier.type === "ImportNamespaceSpecifier")
          ) {
            namespaceImports.add(specifier.local.name);
          }
        }
      },

      "CallExpression > Identifier.callee"(node) {
        const messageId = memoizeNames.get(node.name);
        if (messageId != null) {
          reportIfModuleLevel(node, messageId);
        }
      },

      "CallExpression > MemberExpression.callee"(node) {
        if (
          node.object.type === "Identifier" &&
          namespaceImports.has(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "memoize"
        ) {
          reportIfModuleLevel(node, "noModuleLevelUnderscoreMemoize");
        }
      },
    };
  },
};
