/**
 * @fileoverview Rule to prevent underscore's memoize at module scope, where its
 * cache lives for the life of the tab.
 */

const ERROR_MESSAGE = [
  "underscore's memoize never evicts and never releases: its cache is a plain",
  "object on the returned function. At module scope that cache lives for the",
  "life of the tab, and the key strings are retained with it.",
  "Give the cache a lifetime that matches the work: a Map created per call, a",
  "WeakMap keyed on a long-lived object, or a cache built inside the component",
  "or instance that uses it.",
].join(" ");

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
      description: "Disallow underscore's unbounded memoize at module scope",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noModuleLevelUnderscoreMemoize: ERROR_MESSAGE,
    },
  },
  create(context) {
    // Names bound to underscore's memoize by a named import in this file.
    const namedImports = new Set();
    // Names bound to the underscore namespace, usually `_`.
    const namespaceImports = new Set();

    function reportIfModuleLevel(node) {
      if (runsAtModuleScope(context.sourceCode.getScope(node))) {
        context.report({ node, messageId: "noModuleLevelUnderscoreMemoize" });
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "underscore") {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            specifier.imported.name === "memoize"
          ) {
            namedImports.add(specifier.local.name);
          } else if (
            specifier.type === "ImportDefaultSpecifier" ||
            specifier.type === "ImportNamespaceSpecifier"
          ) {
            namespaceImports.add(specifier.local.name);
          }
        }
      },

      "CallExpression > Identifier.callee"(node) {
        if (namedImports.has(node.name)) {
          reportIfModuleLevel(node);
        }
      },

      "CallExpression > MemberExpression.callee"(node) {
        if (
          node.object.type === "Identifier" &&
          namespaceImports.has(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "memoize"
        ) {
          reportIfModuleLevel(node);
        }
      },
    };
  },
};
