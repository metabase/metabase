import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

// The plugin reads the token once, when it is registered.
beforeAll(() => {
  mockSettings({
    "token-features": createMockTokenFeatures({ tenants: false }),
  });
  setupEnterprisePlugins();
});

describe("tenants plugin on a token without the tenants feature", () => {
  it("stays disabled", () => {
    expect(PLUGIN_TENANTS.isEnabled).toBe(false);
  });

  it("offers no user strategy button, so multi tenancy cannot be turned on", () => {
    renderWithProviders(
      <PLUGIN_TENANTS.EditUserStrategySettingsButton page="people" />,
    );

    expect(screen.queryByLabelText("gear icon")).not.toBeInTheDocument();
  });

  it("registers no tenant admin routes", () => {
    expect(PLUGIN_TENANTS.tenantsRoutes).toBeNull();
    expect(PLUGIN_TENANTS.userStrategyRoute).toBeNull();
  });
});
