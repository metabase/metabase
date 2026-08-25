import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupTenantEntpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHubTenancyPage } from "./EmbeddingHubTenancyPage";

interface SetupOpts {
  hasTenants?: boolean;
  isUsingTenants?: boolean;
}

function setup({ hasTenants = false, isUsingTenants = false }: SetupOpts = {}) {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ tenants: hasTenants }),
    "use-tenants": isUsingTenants,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([{ key: "use-tenants", value: isUsingTenants }]);
  setupUpdateSettingEndpoint();
  setupTenantEntpoints([]);

  // Settings before plugins: PLUGIN_TENANTS registers on `hasPremiumFeature`,
  // so registering first would leave EditUserStrategyModal unset.
  const storeSettings = mockSettings(settings);
  setupEnterprisePlugins();

  return renderWithProviders(
    <Route path="/embedding/tenancy" element={<EmbeddingHubTenancyPage />} />,
    {
      withRouter: true,
      initialRoute: "/embedding/tenancy",
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("EmbeddingHubTenancyPage", () => {
  describe("not licensed", () => {
    it("upsells and offers nothing to turn on", async () => {
      setup({ hasTenants: false });

      expect(
        await screen.findByText("Use a multi-tenant user strategy"),
      ).toBeInTheDocument();

      expect(
        screen.queryByRole("button", { name: "Enable multi-tenancy" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Tenants" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("licensed but tenancy is off", () => {
    it("shows the enable card instead of the upsell or the listing", async () => {
      setup({ hasTenants: true, isUsingTenants: false });

      expect(
        await screen.findByText("Enable multi-tenant user strategy"),
      ).toBeInTheDocument();

      expect(
        screen.queryByText("Use a multi-tenant user strategy"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("tab", { name: "Tenants" }),
      ).not.toBeInTheDocument();
    });

    it("opens the user-strategy modal rather than navigating", async () => {
      setup({ hasTenants: true, isUsingTenants: false });

      await userEvent.click(
        await screen.findByRole("button", { name: "Enable multi-tenancy" }),
      );

      // Routing to `.../user-strategy` would have matched a modal route that
      // hangs off the tenants listing, which this state does not render.
      expect(
        await screen.findByRole("heading", { name: "Pick a user strategy" }),
      ).toBeInTheDocument();
    });
  });

  describe("licensed and tenancy is on", () => {
    it("carries the tab bar that PeopleNav supplies in admin", async () => {
      setup({ hasTenants: true, isUsingTenants: true });

      expect(
        await screen.findByRole("tab", { name: "Tenants" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Tenant groups" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "Tenant users" }),
      ).toBeInTheDocument();

      expect(
        screen.queryByText("Enable multi-tenant user strategy"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Use a multi-tenant user strategy"),
      ).not.toBeInTheDocument();
    });

    it("tags its docs link with the hub's campaign", async () => {
      setup({ hasTenants: true, isUsingTenants: true });

      const docsLink = await screen.findByRole("link", {
        name: /Documentation/,
      });

      expect(docsLink).toHaveAttribute(
        "href",
        expect.stringContaining("utm_campaign=embedding-hub"),
      );
    });
  });
});
