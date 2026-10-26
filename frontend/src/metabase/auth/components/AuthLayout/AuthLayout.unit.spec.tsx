import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupLogoEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type {
  EnterpriseSettings,
  IllustrationSettingValue,
} from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { AuthLayout } from "./AuthLayout";

const CUSTOM_ILLUSTRATION_URL =
  "api/session/illustration/login-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  illustration?: IllustrationSettingValue;
  customIllustrationUrl?: EnterpriseSettings["login-page-illustration-custom"];
}

const setup = ({
  illustration = "default",
  customIllustrationUrl = CUSTOM_ILLUSTRATION_URL,
}: SetupOpts = {}) => {
  // mockSettings seeds the MetabaseSettings singleton that the plugin's own
  // feature check reads, so it has to run before the plugin initializes.
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ whitelabel: true }),
      "login-page-illustration": illustration,
      "login-page-illustration-custom": customIllustrationUrl,
    }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");
  setupLogoEndpoint();

  return renderWithProviders(<AuthLayout>Sign in</AuthLayout>, {
    storeInitialState: state,
  });
};

const getLighthouse = (container: HTMLElement) =>
  container.querySelector("svg");

describe("AuthLayout", () => {
  it("should show the lighthouse illustration by default", () => {
    const { container } = setup({ illustration: "default" });

    expect(getLighthouse(container)).toBeInTheDocument();
    expect(
      screen.queryByTestId("login-page-illustration"),
    ).not.toBeInTheDocument();
  });

  it("should show the custom illustration when one is uploaded", () => {
    const { container } = setup({ illustration: "custom" });

    expect(screen.getByTestId("login-page-illustration")).toHaveStyle({
      backgroundImage: `url("${CUSTOM_ILLUSTRATION_URL}")`,
    });
    expect(getLighthouse(container)).not.toBeInTheDocument();
  });

  it("should show no illustration when the setting is 'none'", () => {
    const { container } = setup({ illustration: "none" });

    expect(
      screen.queryByTestId("login-page-illustration"),
    ).not.toBeInTheDocument();
    expect(getLighthouse(container)).not.toBeInTheDocument();
  });

  it("should show no illustration when 'custom' is selected but nothing is uploaded", () => {
    const { container } = setup({
      illustration: "custom",
      customIllustrationUrl: "",
    });

    expect(
      screen.queryByTestId("login-page-illustration"),
    ).not.toBeInTheDocument();
    expect(getLighthouse(container)).not.toBeInTheDocument();
  });
});
