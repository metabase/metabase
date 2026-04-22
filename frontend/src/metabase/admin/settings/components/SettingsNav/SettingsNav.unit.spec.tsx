import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupSettingEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockLocation,
  createMockRoutingState,
  createMockSettingsState,
} from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
  createMockVersionInfo,
} from "metabase-types/api/mocks";

import { SettingsNav } from "./SettingsNav";

const setup = async ({
  initialRoute,
  isHosted,
  customVizDevModeEnabled,
}: {
  initialRoute: string;
  isHosted?: boolean;
  customVizDevModeEnabled?: boolean;
}) => {
  const versionInfo = createMockVersionInfo();
  const settings = createMockSettings({
    "version-info": versionInfo,
    "custom-viz-plugin-dev-mode-enabled": Boolean(customVizDevModeEnabled),
    "token-features": createMockTokenFeatures({
      hosting: Boolean(isHosted),
      "custom-viz": true,
      "custom-viz-available": true,
    }),
  });

  setupSettingEndpoint({
    settingKey: "version-info",
    settingValue: versionInfo,
  });

  renderWithProviders(<Route path="*" component={SettingsNav} />, {
    withRouter: true,
    initialRoute,
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
      routing: createMockRoutingState({
        locationBeforeTransitions: createMockLocation({
          pathname: initialRoute,
        }),
      }),
      settings: createMockSettingsState(settings),
    },
  });
};

describe("SettingsNav", () => {
  it("should render the settings nav", async () => {
    await setup({ initialRoute: "/admin/settings/general" });

    expect(await screen.findByText("General")).toBeInTheDocument();
    expect(await screen.findByText("Authentication")).toBeInTheDocument();
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
