import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupUnsubscribeFromPulseEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { IllustrationSettingValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { UnsubscribePage } from "./Unsubscribe";

const ILLUSTRATION_URL =
  "api/session/illustration/login-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  loginPageIllustration: IllustrationSettingValue;
}

const setup = ({ loginPageIllustration }: SetupOpts) => {
  const settings = mockSettings({
    // A non-SVG data URI renders without a fetch of the whitelabel logo
    "application-logo-url": "data:image/png;base64,iVBORw0KGgo=",
    "login-page-illustration": loginPageIllustration,
    "login-page-illustration-custom": ILLUSTRATION_URL,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");
  setupUnsubscribeFromPulseEndpoint({ title: "Orders alert" });

  renderWithProviders(
    <Route path="/unsubscribe" element={<UnsubscribePage />} />,
    {
      withRouter: true,
      initialRoute: "/unsubscribe?hash=hash&email=email&pulse-id=pulse-id",
      storeInitialState: { settings },
    },
  );
};

describe("UnsubscribePage (EE with whitelabel)", () => {
  it("should show a custom login page illustration", async () => {
    setup({ loginPageIllustration: "custom" });

    expect(
      await screen.findByText(/from the "Orders alert" alert/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("unsubscribe-page-illustration")).toHaveStyle({
      backgroundImage: `url("${ILLUSTRATION_URL}")`,
    });
  });

  it("should not show an illustration when it is turned off", async () => {
    setup({ loginPageIllustration: "none" });

    expect(
      await screen.findByText(/from the "Orders alert" alert/),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("unsubscribe-page-illustration"),
    ).not.toBeInTheDocument();
  });
});
