// Reports a plugin slot declared outside a plugins file.
// A slot is an exported `PLUGIN_*` binding or a use of `definePluginSlot`, and it lives in `metabase/plugins/` or in a module's `plugins.ts` or `plugins/` directory.

const SLOT_NAME = /^PLUGIN_[A-Z0-9_]+$/;
const SLOT_FACTORY = "definePluginSlot";
const PLUGINS_FILE = /^plugins\.(ts|tsx|js|jsx)$/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Restrict plugin slot declarations to metabase/plugins/ and to a module's plugins.ts file or plugins/ directory",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      slotOutsidePluginsFile:
        '`{{name}}` declares a plugin slot, which is only allowed in "metabase/plugins/" or in a module\'s "plugins.ts" file or "plugins/" directory. Declare the slot there and export it through the module\'s index.',
    },
  },
  create(context) {
    const segments = context.filename.split("/");
    const baseFilename = segments[segments.length - 1] || "";
    const isPluginsFile = PLUGINS_FILE.test(baseFilename);
    const isInPluginsDir = segments.slice(0, -1).includes("plugins");

    if (isPluginsFile || isInPluginsDir) {
      return {};
    }

    function report(node, name) {
      context.report({
        node,
        messageId: "slotOutsidePluginsFile",
        data: { name },
      });
    }

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier" &&
            importedNameOf(specifier) === SLOT_FACTORY
          ) {
            report(specifier, SLOT_FACTORY);
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (node.declaration?.type !== "VariableDeclaration") {
          return;
        }
        for (const declarator of node.declaration.declarations) {
          if (
            declarator.id.type === "Identifier" &&
            SLOT_NAME.test(declarator.id.name)
          ) {
            report(declarator.id, declarator.id.name);
          }
        }
      },
    };
  },
};

function importedNameOf(specifier) {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : String(specifier.imported.value);
}
