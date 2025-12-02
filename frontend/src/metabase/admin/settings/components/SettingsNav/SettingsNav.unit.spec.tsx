import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { setupSettingEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockVersionInfo,
} from "metabase-types/api/mocks";
import {
  createMockLocation,
  createMockRoutingState,
  createMockSettingsState,
} from "metabase-types/store/mocks";

import { SettingsNav } from "./SettingsNav";

const setup = async ({
  initialRoute,
  isHosted,
}: {
  initialRoute: string;
  isHosted?: boolean;
}) => {
  const versionInfo = createMockVersionInfo();
  const settings = createMockSettings({
    "version-info": versionInfo,
    "token-features": createMockTokenFeatures({
      hosting: Boolean(isHosted),
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
});
