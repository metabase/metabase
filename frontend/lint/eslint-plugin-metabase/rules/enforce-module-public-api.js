/**
 * @fileoverview Modules flagged `enforcePublicApi` in module-boundaries.mjs must be imported through their index.
 * Their own files must import relatively — importing the module's own alias creates a self-cycle through the index.
 * The modules arrive as rule options because this plugin is CJS and the registry is ESM.
 */

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce importing modules with a public API through their index",
      category: "Best Practices",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          modules: {
            type: "array",
            // Import aliases of module roots, e.g. "metabase/analytics"
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useModuleIndex:
        "Import from the module's public interface ('{{alias}}') instead of a file inside it.",
      useRelativeImport:
        "Files inside a module must use relative imports, not the module's own '{{alias}}' alias.",
    },
  },
  create(context) {
    const modules = (context.options[0] && context.options[0].modules) || [];
    if (modules.length === 0) {
      return {};
    }

    // Longest alias first, so a nested module wins over its parent when both match.
    const aliases = [...modules].sort((a, b) => b.length - a.length);

    const filename = context.filename.replaceAll("\\", "/");
    const owningAlias = aliases.find((alias) =>
      filename.includes(`/frontend/src/${alias}/`),
    );

    const checkSource = (sourceNode) => {
      const source = sourceNode && sourceNode.value;
      if (typeof source !== "string") {
        return;
      }
      const target = aliases.find(
        (alias) => source === alias || source.startsWith(`${alias}/`),
      );
      if (!target) {
        return;
      }
      if (target === owningAlias) {
        context.report({
          node: sourceNode,
          messageId: "useRelativeImport",
          data: { alias: target },
        });
        return;
      }
      if (source !== target) {
        context.report({
          node: sourceNode,
          messageId: "useModuleIndex",
          data: { alias: target },
        });
      }
    };

    return {
      ImportDeclaration(node) {
        checkSource(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          checkSource(node.source);
        }
      },
      ExportAllDeclaration(node) {
        checkSource(node.source);
      },
      ImportExpression(node) {
        checkSource(node.source);
      },
    };
  },
};
