import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";

import rule from "../eslint-plugin-metabase/rules/no-plugin-slot-outside-plugins-files";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    sourceType: "module",
  },
});

const error = { messageId: "slotOutsidePluginsFile" };

const VALID_CASES = [
  // Slots may be declared anywhere under metabase/plugins/.
  {
    code: `
      import { definePluginSlot } from "../slot";
      export const PLUGIN_AUDIT = definePluginSlot(() => ({}));
    `,
    filename: "frontend/src/metabase/plugins/oss/audit.ts",
  },
  {
    code: `export const PLUGIN_WHITELABEL = getDefaultPluginWhitelabel();`,
    filename: "frontend/src/metabase/plugins/index.ts",
  },
  // A module declares its slots in plugins.ts or under plugins/.
  {
    code: `
      import { definePluginSlot } from "metabase/plugins";
      export const PLUGIN_SEARCH = definePluginSlot(() => ({}));
    `,
    filename: "frontend/src/metabase/search/plugins.ts",
  },
  {
    code: `export const PLUGIN_SEARCH = definePluginSlot(() => ({}));`,
    filename: "frontend/src/metabase/search/plugins.tsx",
  },
  {
    code: `export const PLUGIN_QUERYING = definePluginSlot(() => ({}));`,
    filename: "frontend/src/metabase/querying/plugins/slots.ts",
  },
  {
    code: `export const PLUGIN_QUERYING = definePluginSlot(() => ({}));`,
    filename: "frontend/src/metabase/querying/plugins/nested/slots.ts",
  },
  {
    code: `export const PLUGIN_SANDBOXES = definePluginSlot(() => ({}));`,
    filename:
      "enterprise/frontend/src/metabase-enterprise/sandboxes/plugins.ts",
  },
  // Filling a slot is not declaring one.
  {
    code: `
      import { PLUGIN_AUDIT } from "metabase/plugins";
      Object.assign(PLUGIN_AUDIT, { isAiAuditingEnabled: true });
      PLUGIN_AUDIT.getAiAuditingRoutes = () => null;
    `,
    filename: "enterprise/frontend/src/metabase-enterprise/audit_app/index.ts",
  },
  // A barrel re-exporting a slot is not declaring one.
  {
    code: `export { PLUGIN_SEARCH } from "./plugins";`,
    filename: "frontend/src/metabase/search/index.ts",
  },
  {
    code: `
      import { PLUGIN_SEARCH } from "./plugins";
      export { PLUGIN_SEARCH };
    `,
    filename: "frontend/src/metabase/search/index.ts",
  },
  // Other exports and imports are unaffected.
  {
    code: `
      import { reinitialize } from "metabase/plugins";
      export const PLUGINS_LOADED = true;
      export const pluginConfig = {};
    `,
    filename: "frontend/src/metabase/search/config.ts",
  },
  {
    code: `const PLUGIN_LOCAL = {};`,
    filename: "frontend/src/metabase/search/config.ts",
  },
];

const INVALID_CASES = [
  {
    name: "PLUGIN_* export in a module file",
    code: `export const PLUGIN_SEARCH = { isEnabled: () => false };`,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error],
  },
  {
    name: "PLUGIN_* export in a module index",
    code: `export const PLUGIN_SEARCH = { isEnabled: () => false };`,
    filename: "frontend/src/metabase/search/index.ts",
    errors: [error],
  },
  {
    name: "PLUGIN_* export in an enterprise file",
    code: `export const PLUGIN_SANDBOXES = {};`,
    filename: "enterprise/frontend/src/metabase-enterprise/sandboxes/index.ts",
    errors: [error],
  },
  {
    name: "PLUGIN_* let export",
    code: `export let PLUGIN_SEARCH = {};`,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error],
  },
  {
    name: "PLUGIN_* export with a type annotation",
    code: `export const PLUGIN_SEARCH: { isEnabled: () => boolean } = { isEnabled: () => false };`,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error],
  },
  {
    name: "definePluginSlot import in a module file",
    code: `import { definePluginSlot } from "metabase/plugins";`,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error],
  },
  {
    name: "definePluginSlot import under an alias",
    code: `import { definePluginSlot as defineSlot } from "metabase/plugins";`,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error],
  },
  {
    name: "import and export flagged individually",
    code: `
      import { definePluginSlot } from "metabase/plugins";
      export const PLUGIN_SEARCH = definePluginSlot(() => ({}));
    `,
    filename: "frontend/src/metabase/search/slots.ts",
    errors: [error, error],
  },
  {
    name: "a plugin.ts file is not a plugins file",
    code: `export const PLUGIN_EMBED_JS_EE = {};`,
    filename: "frontend/src/metabase/embedding/plugin.ts",
    errors: [error],
  },
  {
    name: "a plugins segment in the file name is not a plugins file",
    code: `export const PLUGIN_SDK = {};`,
    filename: "frontend/src/metabase/embedding/sdk-plugins.ts",
    errors: [error],
  },
];

ruleTester.run("no-plugin-slot-outside-plugins-files", rule, {
  valid: VALID_CASES,
  invalid: INVALID_CASES.map(({ code, filename, errors }) => ({
    code,
    filename,
    errors,
  })),
});
