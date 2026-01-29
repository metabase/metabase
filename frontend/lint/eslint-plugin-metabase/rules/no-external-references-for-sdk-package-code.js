const path = require("path");

const resolve = require("eslint-module-utils/resolve").default;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow imports/requires in SDK-package code that resolve outside of the allowed directories",
      category: "Best Practices",
      recommended: false,
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedPaths: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
          },
        },
        required: ["allowedPaths"],
        additionalProperties: false,
      },
    ],
    messages: {
      externalImport:
        'Import of "{{importPath}}" resolves outside of the allowed directories.',
    },
  },

  create(context) {
    const [{ allowedPaths } = {}] = context.options;

    if (
      !Array.isArray(allowedPaths) ||
      allowedPaths.some((allowedPath) => typeof allowedPath !== "string")
    ) {
      return {};
    }

    const cwd = process.cwd();
    const resolvedAllowedPaths = allowedPaths.map((allowedPath) =>
      path.resolve(cwd, allowedPath),
    );
    const filename = context.getFilename();

    // Only lint files inside one of the allowed directories
    if (
      !filename ||
      filename === "<input>" ||
      !resolvedAllowedPaths.some((directory) =>
        filename.startsWith(directory + path.sep),
      )
    ) {
      return {};
    }

    /**
     * Resolve an import path and report if it's outside all allowedDirs
     */
    function checkImport(node, importPath) {
      const resolvedPath = resolve(importPath, context);

      if (!resolvedPath) {
        return;
      }

      const absolutePath = path.resolve(resolvedPath);

      // Skip external dependencies from node_modules
      if (absolutePath.includes(`${path.sep}node_modules${path.sep}`)) {
        return;
      }

      if (
        !resolvedAllowedPaths.some((directory) =>
          absolutePath.startsWith(directory + path.sep),
        )
      ) {
        context.report({
          node,
          messageId: "externalImport",
          data: { importPath },
        });
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") {
          return;
        }

        checkImport(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (
          node.source.type === "Literal" &&
          typeof node.source.value === "string"
        ) {
          checkImport(node.source, node.source.value);
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "Literal" &&
          typeof node.arguments[0].value === "string"
        ) {
          checkImport(node.arguments[0], node.arguments[0].value);
        }
      },
    };
  },
};
