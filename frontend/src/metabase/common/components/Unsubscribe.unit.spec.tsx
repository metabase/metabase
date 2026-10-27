import fetchMock from "fetch-mock";

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

import { UnsubscribePage } from "./Unsubscribe";

const CUSTOM_ILLUSTRATION_URL =
  "api/session/illustration/login-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  illustration?: IllustrationSettingValue;
  customIllustrationUrl?: EnterpriseSettings["login-page-illustration-custom"];
}

const setup = async ({
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
  fetchMock.post("path:/api/pulse/unsubscribe", { title: "My subscription" });

  renderWithProviders(<UnsubscribePage />, {
    withRouter: true,
    initialRoute:
      "/unsubscribe?hash=hash&email=user%40example.com&pulse-id=pulse-id",
    storeInitialState: state,
  });

  await screen.findByText(/My subscription/);
};

describe("UnsubscribePage", () => {
  it("should show the custom illustration when one is uploaded", async () => {
    await setup({ illustration: "custom" });

    expect(screen.getByTestId("unsubscribe-page-illustration")).toHaveStyle({
      backgroundImage: `url("${CUSTOM_ILLUSTRATION_URL}")`,
    });
  });

  it("should show no custom illustration by default", async () => {
    await setup({ illustration: "default" });

    expect(
      screen.queryByTestId("unsubscribe-page-illustration"),
    ).not.toBeInTheDocument();
  });

  it("should show no illustration when the setting is 'none'", async () => {
    await setup({ illustration: "none" });

    expect(
      screen.queryByTestId("unsubscribe-page-illustration"),
    ).not.toBeInTheDocument();
  });
});
