/**
 * @fileoverview Rule to prevent new uses of underscore's memoize, whose cache
 * is unbounded and never released.
 */

const ALLOWLIST = require("../../underscore-memoize-allowlist");

const ERROR_MESSAGE = [
  "underscore's memoize never evicts and never releases: its cache is a plain",
  "object on the returned function, so every distinct key is retained for the",
  "life of the tab. It also hashes only the first argument by default.",
  "Use a cache scoped to the work instead: a WeakMap keyed on a long-lived",
  "object, a Map created per call, or memoize from metabase/utils/memoize.",
].join(" ");

function isAllowlisted(filename) {
  const normalized = filename.split("\\").join("/");
  return ALLOWLIST.some((allowed) => normalized.endsWith(allowed));
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow underscore's unbounded memoize",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noUnderscoreMemoize: ERROR_MESSAGE,
    },
  },
  create(context) {
    if (isAllowlisted(context.filename)) {
      return {};
    }

    // Names bound to underscore's memoize by a named import in this file.
    const namedImports = new Set();
    // Names bound to the underscore namespace, usually `_`.
    const namespaceImports = new Set();

    function report(node) {
      context.report({ node, messageId: "noUnderscoreMemoize" });
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
          report(node);
        }
      },

      "CallExpression > MemberExpression.callee"(node) {
        if (
          node.object.type === "Identifier" &&
          namespaceImports.has(node.object.name) &&
          node.property.type === "Identifier" &&
          node.property.name === "memoize"
        ) {
          report(node);
        }
      },
    };
  },
};
