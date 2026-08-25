import {
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_MULTI_FACTOR_AUTH,
  PLUGIN_SECURITY_CENTER,
  PLUGIN_TENANTS,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { pluginPlaceholderRoute } from "metabase/plugins/components/PluginPlaceholder";
import type { PluginRoute } from "metabase/plugins/types";

import { initializePlugins } from "./plugins";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: () => true,
}));

/**
 * A registry route slot holds a loader that names its page in an `import()`, so
 * nothing type-checks the path or the export any more. Nothing renders these
 * routes in a test either, so a typo would first show up as a blank page.
 * Resolving every loader is the cheap guard against that.
 */
const SLOTS: [string, () => PluginRoute][] = [
  ["security center", () => PLUGIN_SECURITY_CENTER.securityCenterPage],
  ["enrolled users", () => PLUGIN_MULTI_FACTOR_AUTH.enrolledUsersPage],
  ["unenrolled users", () => PLUGIN_MULTI_FACTOR_AUTH.unenrolledUsersPage],
  ["SAML settings", () => PLUGIN_AUTH_PROVIDERS.settingsSAMLForm],
  ["JWT settings", () => PLUGIN_AUTH_PROVIDERS.settingsJWTForm],
  ["OIDC settings", () => PLUGIN_AUTH_PROVIDERS.settingsOIDCForm],
  [
    "python runner settings",
    () => PLUGIN_TRANSFORMS_PYTHON.pythonRunnerSettingsPage,
  ],
  [
    "tenant specific collection guard",
    () => PLUGIN_TENANTS.canAccessTenantSpecificRoute,
  ],
  ["tenant collection list", () => PLUGIN_TENANTS.tenantCollectionList],
  ["tenant users list", () => PLUGIN_TENANTS.tenantUsersList],
  [
    "tenant user personal collections",
    () => PLUGIN_TENANTS.tenantUsersPersonalCollectionList,
  ],
];

describe("lazy plugin route slots", () => {
  beforeAll(() => {
    initializePlugins();
  });

  it.each(SLOTS)("resolves the %s page", async (_name, getSlot) => {
    const load = getSlot();

    expect(load).not.toBe(pluginPlaceholderRoute);
    expect((await load()).Component).toBeDefined();
  });
});
