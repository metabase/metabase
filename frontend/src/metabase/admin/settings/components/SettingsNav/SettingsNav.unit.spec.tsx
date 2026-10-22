import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import { setupSettingEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { Route } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { SettingsNav } from "./SettingsNav";

type SetupOpts = {
  initialRoute: string;
  isAdmin?: boolean;
  isHosted?: boolean;
  customVizDevModeEnabled?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
  enterprisePlugins?: ENTERPRISE_PLUGIN_NAME[];
};

const setup = async ({
  initialRoute,
  isAdmin = true,
  isHosted,
  customVizDevModeEnabled,
  tokenFeatures,
  enterprisePlugins,
}: SetupOpts) => {
  const versionInfo = createMockVersionInfo();
  const settings = mockSettings({
    "version-info": versionInfo,
    "custom-viz-plugin-dev-mode-enabled": Boolean(customVizDevModeEnabled),
    "token-features": createMockTokenFeatures({
      hosting: Boolean(isHosted),
      "custom-viz": true,
      "custom-viz-available": true,
      ...tokenFeatures,
    }),
  });

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });
  enterprisePlugins?.forEach(setupEnterpriseOnlyPlugin);

  renderWithProviders(<Route path="*" element={<SettingsNav />} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings,
    },
  });
};

describe("SettingsNav", () => {
  afterEach(() => {
    reinitialize();
  });

  it("should render the settings nav", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(await screen.findByText("Authentication")).toBeInTheDocument();
  });

  it("should show the Remote sync nav item with an upsell gem when remote sync is not enabled", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    const remoteSyncNavItem = await screen.findByRole("link", {
      name: /Remote sync/,
    });
    expect(
      within(remoteSyncNavItem).getByTestId("upsell-gem"),
    ).toBeInTheDocument();
  });

  it("should show the Remote sync nav item without an upsell gem when remote sync is enabled", async () => {
    await setup({
      initialRoute: "/admin/settings/general",
      tokenFeatures: { remote_sync: true },
      enterprisePlugins: ["remote_sync"],
    });

    const remoteSyncNavItem = await screen.findByRole("link", {
      name: /Remote sync/,
    });
    expect(
      within(remoteSyncNavItem).queryByTestId("upsell-gem"),
    ).not.toBeInTheDocument();
  });

  it("should highlight the active nav item", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    const generalNavItem = await screen.findByRole("link", { name: /General/ });
    expect(generalNavItem).toHaveAttribute("data-active", "true");

    const authNavItem = screen.getByText("Authentication");
    expect(authNavItem).not.toHaveAttribute("data-active");
  });

  it("should collapse sections by default", async () => {
    await setup({ initialRoute: "/admin/settings/general" });
    const authNavItem = screen.getByRole("link", { name: /Authentication/ });
    expect(authNavItem).not.toHaveAttribute("data-expanded");
  });

  it("should open a section by default if the page loads on a child route", async () => {
    await setup({ initialRoute: "/admin/settings/authentication/google" });

    const authNavItem = await screen.findByRole("link", {
      name: /Authentication/,
    });
    expect(authNavItem).toHaveAttribute("data-expanded", "true");
    const googleAuthItem = await screen.findByRole("link", {
      name: /Google auth/,
    });
    expect(googleAuthItem).toHaveAttribute("data-active", "true");
  });

  it("should expand and collapse a section", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    const authNavItem = await screen.findByRole("link", {
      name: /Authentication/,
    });

    expect(authNavItem).not.toHaveAttribute("data-expanded");
    await userEvent.click(authNavItem); // expand
    expect(authNavItem).toHaveAttribute("data-expanded", "true");
    await userEvent.click(authNavItem); // collapse
    expect(authNavItem).not.toHaveAttribute("data-expanded");
  });

  it("should highlight a collapsed parent when a child is active", async () => {
    await setup({ initialRoute: "/admin/settings/authentication/google" });

    const authNavItem = await screen.findByRole("link", {
      name: /Authentication/,
    });
    const googleAuthItem = await screen.findByRole("link", {
      name: /Google auth/,
    });
    expect(authNavItem).toHaveAttribute("data-expanded", "true");
    expect(authNavItem).not.toHaveAttribute("data-active");
    expect(googleAuthItem).toHaveAttribute("data-active", "true");

    await userEvent.click(authNavItem);
    expect(authNavItem).not.toHaveAttribute("data-expanded");
    expect(authNavItem).toHaveAttribute("data-active", "true");
  });

  it("should only show Updates nav item when hosted", async () => {
    await setup({ initialRoute: "/admin/settings/general", isHosted: true });
    expect(screen.queryByText("Updates")).not.toBeInTheDocument();
  });

  it("should show only allowlisted pages to settings managers", async () => {
    await setup({
      initialRoute: "/admin/settings/general",
      isAdmin: false,
      tokenFeatures: {
        "custom-viz": false,
        "custom-viz-available": false,
      },
    });

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.getByText("Domains")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    expect(screen.getByText("Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Localization")).toBeInTheDocument();
    expect(screen.getByText("Maps")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Uploads")).toBeInTheDocument();
    expect(screen.getByText("Public sharing")).toBeInTheDocument();

    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(screen.queryByText("License")).not.toBeInTheDocument();
    expect(screen.queryByText("Updates")).not.toBeInTheDocument();
    expect(screen.queryByText("Cloud")).not.toBeInTheDocument();
    expect(screen.queryByText("Remote sync")).not.toBeInTheDocument();
    expect(screen.queryByText("Custom visualizations")).not.toBeInTheDocument();
    expect(screen.queryByText("Data apps")).not.toBeInTheDocument();
    expect(screen.queryByText("Python Runner")).not.toBeInTheDocument();
    expect(screen.queryByText("Branding")).not.toBeInTheDocument();
  });

  it("should show the Appearance folder to settings managers when whitelabel is enabled", async () => {
    await setup({
      initialRoute: "/admin/settings/whitelabel/branding",
      isAdmin: false,
      tokenFeatures: { whitelabel: true },
    });

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(screen.getByText("Branding")).toBeInTheDocument();
    expect(screen.getByText("Conceal Metabase")).toBeInTheDocument();
  });

  it("should hide Authentication and Python Runner from settings managers even with related tokens", async () => {
    await setup({
      initialRoute: "/admin/settings/general",
      isAdmin: false,
      tokenFeatures: {
        scim: true,
        sso_saml: true,
        "transforms-python": true,
      },
    });

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(screen.queryByText("Authentication")).not.toBeInTheDocument();
    expect(screen.queryByText("Python Runner")).not.toBeInTheDocument();
  });

  it("should not request version-info for settings managers", async () => {
    await setup({ initialRoute: "/admin/settings/general", isAdmin: false });

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/setting/version-info")).toBe(
      false,
    );
  });

  it("should show License and Updates to admins", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    expect(await screen.findByText("License")).toBeInTheDocument();
    expect(screen.getByText("Updates")).toBeInTheDocument();
  });

  it("should show Development nav item when custom viz dev mode is enabled", async () => {
    await setup({
      initialRoute: "/admin/settings/custom-visualizations",
      customVizDevModeEnabled: true,
    });

    const customVizNavItem = await screen.findByRole("link", {
      name: /Custom visualizations/,
    });
    await userEvent.click(customVizNavItem);

    expect(screen.getByText("Development")).toBeInTheDocument();
  });

  it("should hide Development nav item when custom viz dev mode is disabled", async () => {
    await setup({
      initialRoute: "/admin/settings/custom-visualizations",
      customVizDevModeEnabled: false,
    });

    const customVizNavItem = await screen.findByRole("link", {
      name: /Custom visualizations/,
    });
    await userEvent.click(customVizNavItem);

    expect(screen.queryByText("Manage visualizations")).not.toBeInTheDocument();
    expect(screen.queryByText("Development")).not.toBeInTheDocument();
  });
});
