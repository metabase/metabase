import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_TENANTS } from "metabase/plugins";

/**
 * An OSS build never loads the tenants plugin, so this file deliberately
 * registers nothing and imports nothing from `metabase-enterprise/tenants`.
 * What it reads are the OSS defaults in `metabase/plugins/oss/tenants.ts`.
 */
describe("tenants plugin on OSS", () => {
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
