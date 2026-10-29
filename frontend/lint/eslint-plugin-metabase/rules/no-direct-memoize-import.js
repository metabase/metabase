/**
 * @fileoverview Rule to keep memoization behind one helper, so there is a
 * single implementation to reason about.
 */

const HOUSE_MEMOIZE = "metabase/utils/memoize";

const MESSAGE = [
  "Import `memoize` from `metabase/utils/memoize` instead.",
  "Keeping one helper means one set of semantics to reason about: it matches",
  "object arguments by reference and primitives by value, and releases an entry",
  "once its object arguments are gone.",
  "underscore's memoize in particular never releases, and hashes only its first",
  "argument unless you pass a hasher.",
].join(" ");

// Library exports that are memoize helpers in their own right.
const RESTRICTED = new Map([
  ["underscore", ["memoize"]],
  ["@reduxjs/toolkit", ["weakMapMemoize", "lruMemoize"]],
  ["reselect", ["weakMapMemoize", "lruMemoize"]],
]);

function isHouseMemoizeModule(filename) {
  const normalized = filename.split("\\").join("/");
  return normalized.endsWith(`${HOUSE_MEMOIZE}.ts`);
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing memoize helpers straight from a library",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      noDirectMemoizeImport: MESSAGE,
    },
  },
  create(context) {
    // The one module allowed to reach for the underlying implementation.
    if (isHouseMemoizeModule(context.filename)) {
      return {};
    }

    // Names bound to the underscore namespace, usually `_`.
    const namespaceImports = new Set();

    function report(node) {
      context.report({ node, messageId: "noDirectMemoizeImport" });
    }

    return {
      ImportDeclaration(node) {
        const restricted = RESTRICTED.get(node.source.value);
        if (restricted == null) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            restricted.includes(specifier.imported.name)
          ) {
            report(specifier);
          } else if (
            node.source.value === "underscore" &&
            (specifier.type === "ImportDefaultSpecifier" ||
              specifier.type === "ImportNamespaceSpecifier")
          ) {
            // The namespace itself is fine, only `_.memoize` off it is not.
            namespaceImports.add(specifier.local.name);
          }
        }
      },

      MemberExpression(node) {
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
