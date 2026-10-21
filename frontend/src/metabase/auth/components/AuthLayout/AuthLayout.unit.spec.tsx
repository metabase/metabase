import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { IllustrationSettingValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { AuthLayout } from "./AuthLayout";

const LOGO_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
const ILLUSTRATION_URL =
  "api/session/illustration/login-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  loginPageIllustration?: IllustrationSettingValue;
}

const setup = ({ loginPageIllustration = "default" }: SetupOpts = {}) => {
  const settings = mockSettings({
    "application-logo-url": LOGO_URL,
    "login-page-illustration": loginPageIllustration,
    "login-page-illustration-custom": ILLUSTRATION_URL,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");

  renderWithProviders(<AuthLayout />, { storeInitialState: { settings } });
};

describe("AuthLayout (EE with whitelabel)", () => {
  it("should show the whitelabel logo", async () => {
    setup();

    const logo = await screen.findByTestId("main-logo");
    expect(within(logo).getByRole("img")).toHaveAttribute("src", LOGO_URL);
  });

  it("should show a custom login page illustration", () => {
    setup({ loginPageIllustration: "custom" });

    expect(screen.getByTestId("login-page-illustration")).toHaveStyle({
      backgroundImage: `url("${ILLUSTRATION_URL}")`,
    });
  });

  it("should not show an illustration when it is turned off", () => {
    setup({ loginPageIllustration: "none" });

    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(
      screen.queryByTestId("login-page-illustration"),
    ).not.toBeInTheDocument();
  });
});
