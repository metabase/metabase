const path = require("path");

const SLOT_NAME = /^PLUGIN_[A-Z0-9_]+$/;
const SLOT_FACTORY = "definePluginSlot";
const PLUGINS_FILE = /^plugins\.(ts|tsx|js|jsx)$/;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Restrict plugin slot declarations, an exported `PLUGIN_*` binding or a use of `definePluginSlot`, to metabase/plugins/ and to a module's plugins.ts file or plugins/ directory",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      slotDeclaration:
        '`{{name}}` declares a plugin slot, which is only allowed in "metabase/plugins/" or in a module\'s "plugins.ts" file or "plugins/" directory. Declare the slot there and export it through the module\'s index.',
      slotFactory:
        '`definePluginSlot` may only be called in "metabase/plugins/" or in a module\'s "plugins.ts" file or "plugins/" directory. Declare the slot there and export it through the module\'s index.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (
      isPluginsFile(filename) ||
      isUnderPluginsDirectory(filename) ||
      isSlotFactoryModule(filename)
    ) {
      return {};
    }

    return {
      VariableDeclarator(node) {
        if (isSlotDeclaration(node)) {
          context.report({
            node: node.id,
            messageId: "slotDeclaration",
            data: { name: node.id.name },
          });
        }
      },
      ExportSpecifier(node) {
        if (
          node.parent.source ||
          node.parent.exportKind === "type" ||
          node.exportKind === "type"
        ) {
          return;
        }

        const exportedName = node.exported.name ?? node.exported.value;
        const name = SLOT_NAME.test(exportedName)
          ? exportedName
          : node.local.name;
        if (!SLOT_NAME.test(name)) {
          return;
        }

        const variable = context.sourceCode
          .getScope(node)
          .set.get(node.local.name);
        // Imported bindings are re-exports, and directly exported declarations
        // are already checked by VariableDeclarator.
        if (
          variable?.defs.some(
            (definition) =>
              definition.type === "Variable" &&
              !isSlotDeclaration(definition.node),
          )
        ) {
          context.report({
            node,
            messageId: "slotDeclaration",
            data: { name },
          });
        }
      },
      ImportSpecifier(node) {
        if (isSlotFactoryImport(node)) {
          context.report({ node, messageId: "slotFactory" });
        }
      },
      MemberExpression(node) {
        if (isSlotFactoryAccess(node)) {
          context.report({ node, messageId: "slotFactory" });
        }
      },
    };
  },
};

function isPluginsFile(filename) {
  return PLUGINS_FILE.test(path.posix.basename(filename));
}

// Covers metabase/plugins/ itself as well as a module's plugins/ directory.
function isUnderPluginsDirectory(filename) {
  return path.posix.dirname(filename).split("/").includes("plugins");
}

function isSlotFactoryModule(filename) {
  return filename.includes("/frontend/src/metabase/plugin-slots/");
}

// `export const PLUGIN_X = ...`, whatever the value is.
function isSlotDeclaration(declarator) {
  return (
    declarator.id.type === "Identifier" &&
    SLOT_NAME.test(declarator.id.name) &&
    declarator.parent.parent.type === "ExportNamedDeclaration"
  );
}

// `import { definePluginSlot }`, under any alias.
function isSlotFactoryImport(specifier) {
  const { imported } = specifier;
  const name = imported.type === "Identifier" ? imported.name : imported.value;
  return name === SLOT_FACTORY;
}

// `plugins.definePluginSlot(...)`, which is how a namespace import reaches the factory.
function isSlotFactoryAccess(member) {
  return (
    !member.computed &&
    member.property.type === "Identifier" &&
    member.property.name === SLOT_FACTORY
  );
}
