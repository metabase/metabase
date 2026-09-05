import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-plugin-slot-outside-plugins-files";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const MODULE_FILE = "/repo/frontend/src/metabase/search/slots.ts";
const MODULE_INDEX = "/repo/frontend/src/metabase/search/index.ts";
const MODULE_PLUGINS_FILE = "/repo/frontend/src/metabase/search/plugins.ts";

const SLOT_EXPORT = `export const PLUGIN_SEARCH = { isEnabled: () => false };`;
const SLOT_FROM_FACTORY = `
  import { definePluginSlot } from "metabase/plugins";
  export const PLUGIN_SEARCH = definePluginSlot(() => ({}));
`;

const slotDeclaration = { messageId: "slotDeclaration" };
const slotFactory = { messageId: "slotFactory" };

const VALID_CASES = [
  // Where a slot may be declared.
  {
    name: "slot under metabase/plugins/",
    filename: "/repo/frontend/src/metabase/plugins/oss/search.ts",
    code: `
      import { definePluginSlot } from "../slot";
      export const PLUGIN_SEARCH = definePluginSlot(() => ({}));
    `,
  },
  {
    name: "slot in a module's plugins.ts",
    filename: MODULE_PLUGINS_FILE,
    code: SLOT_FROM_FACTORY,
  },
  {
    name: "slot in a module's plugins.tsx",
    filename: "/repo/frontend/src/metabase/search/plugins.tsx",
    code: SLOT_EXPORT,
  },
  {
    name: "slot under a module's plugins/ directory",
    filename: "/repo/frontend/src/metabase/querying/plugins/slots.ts",
    code: SLOT_EXPORT,
  },
  {
    name: "slot nested under a module's plugins/ directory",
    filename: "/repo/frontend/src/metabase/querying/plugins/nested/slots.ts",
    code: SLOT_EXPORT,
  },
  {
    name: "slot in a plugins.ts under a Windows path",
    filename: "C:\\repo\\frontend\\src\\metabase\\search\\plugins.ts",
    code: SLOT_FROM_FACTORY,
  },
  // What is not a slot declaration.
  {
    name: "filling a slot",
    filename:
      "/repo/enterprise/frontend/src/metabase-enterprise/audit_app/index.ts",
    code: `
      import { PLUGIN_AUDIT } from "metabase/plugins";
      Object.assign(PLUGIN_AUDIT, { isAiAuditingEnabled: true });
      PLUGIN_AUDIT.getAiAuditingRoutes = () => null;
    `,
  },
  {
    name: "re-exporting a slot from a barrel",
    filename: MODULE_INDEX,
    code: `export { PLUGIN_SEARCH } from "./plugins";`,
  },
  {
    name: "a PLUGIN_* type",
    filename: MODULE_FILE,
    code: `export type PLUGIN_SEARCH = { isEnabled: () => boolean };`,
  },
  {
    name: "a PLUGIN_* const that is not exported",
    filename: MODULE_FILE,
    code: `const PLUGIN_LOCAL = {};`,
  },
  {
    name: "exports whose name is not PLUGIN_*",
    filename: MODULE_FILE,
    code: `
      export const PLUGINS_LOADED = true;
      export const pluginConfig = {};
    `,
  },
  {
    name: "other imports from metabase/plugins",
    filename: MODULE_FILE,
    code: `
      import { PLUGIN_AUDIT, reinitialize } from "metabase/plugins";
      import type { PluginAudit } from "metabase/plugins";
    `,
  },
];

const INVALID_CASES = [
  // A slot exported outside a plugins file.
  {
    name: "slot exported from a module file",
    filename: MODULE_FILE,
    code: SLOT_EXPORT,
    errors: [slotDeclaration],
  },
  {
    name: "slot exported from a module index",
    filename: MODULE_INDEX,
    code: SLOT_EXPORT,
    errors: [slotDeclaration],
  },
  {
    name: "slot exported with let",
    filename: MODULE_FILE,
    code: `export let PLUGIN_SEARCH = {};`,
    errors: [slotDeclaration],
  },
  {
    name: "slot exported with a type annotation",
    filename: MODULE_FILE,
    code: `export const PLUGIN_SEARCH: { isEnabled: () => boolean } = { isEnabled: () => false };`,
    errors: [slotDeclaration],
  },
  {
    name: "a plugin.ts file is not a plugins file",
    filename: "/repo/frontend/src/metabase/embedding/plugin.ts",
    code: SLOT_EXPORT,
    errors: [slotDeclaration],
  },
  {
    name: "a file name that only contains plugins is not a plugins file",
    filename: "/repo/frontend/src/metabase/embedding/sdk-plugins.ts",
    code: SLOT_EXPORT,
    errors: [slotDeclaration],
  },
  {
    name: "a directory name that only starts with plugins is not a plugins directory",
    filename: "/repo/frontend/src/metabase/embedding/pluginsx/slots.ts",
    code: SLOT_EXPORT,
    errors: [slotDeclaration],
  },
  // The slot factory reached outside a plugins file.
  {
    name: "definePluginSlot imported",
    filename: MODULE_FILE,
    code: `import { definePluginSlot } from "metabase/plugins";`,
    errors: [slotFactory],
  },
  {
    name: "definePluginSlot imported under an alias",
    filename: MODULE_FILE,
    code: `import { definePluginSlot as defineSlot } from "metabase/plugins";`,
    errors: [slotFactory],
  },
  {
    name: "definePluginSlot imported by string name",
    filename: MODULE_FILE,
    code: `import { "definePluginSlot" as defineSlot } from "metabase/plugins";`,
    errors: [slotFactory],
  },
  {
    name: "definePluginSlot reached through a namespace import",
    filename: MODULE_FILE,
    code: `
      import * as plugins from "metabase/plugins";
      const slot = plugins.definePluginSlot(() => ({}));
    `,
    errors: [slotFactory],
  },
  {
    name: "import and export reported separately",
    filename: MODULE_FILE,
    code: SLOT_FROM_FACTORY,
    errors: [slotFactory, slotDeclaration],
  },
];

ruleTester.run("no-plugin-slot-outside-plugins-files", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES,
});
