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

    const filename = context.filename.replaceAll("\\", "/");

    const checkSource = (sourceNode) => {
      const source = sourceNode && sourceNode.value;
      if (typeof source !== "string") {
        return;
      }
      for (const alias of modules) {
        const isModuleFile = filename.includes(`/frontend/src/${alias}/`);
        if (source === alias) {
          if (isModuleFile) {
            context.report({
              node: sourceNode,
              messageId: "useRelativeImport",
              data: { alias },
            });
          }
          return;
        }
        if (source.startsWith(`${alias}/`)) {
          context.report({
            node: sourceNode,
            messageId: isModuleFile ? "useRelativeImport" : "useModuleIndex",
            data: { alias },
          });
          return;
        }
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
