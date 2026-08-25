import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupGroupsEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import {
  createMockGroup,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHubAuthenticationPage } from "./EmbeddingHubAuthenticationPage";

interface SetupOpts {
  hasSsoJwt?: boolean;
  isJwtConfigured?: boolean;
  isSamlConfigured?: boolean;
}

function setup({
  hasSsoJwt = false,
  isJwtConfigured = false,
  isSamlConfigured = false,
}: SetupOpts = {}) {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ sso_jwt: hasSsoJwt }),
    "jwt-configured": isJwtConfigured,
    "saml-configured": isSamlConfigured,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupGroupsEndpoint([createMockGroup()]);

  // Settings before plugins: PLUGIN_AUTH_PROVIDERS.settingsJWTForm is only
  // registered when `hasPremiumFeature("sso_jwt")` is true, and that reads the
  // mocked settings.
  const storeSettings = mockSettings(settings);
  setupEnterprisePlugins();

  renderWithProviders(
    <Route path="/" element={<EmbeddingHubAuthenticationPage />} />,
    {
      withRouter: true,
      initialRoute: "/",
      storeInitialState: createMockState({
        settings: storeSettings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("EmbeddingHubAuthenticationPage", () => {
  it("upsells instead of showing the JWT form when SSO is not licensed", async () => {
    setup({ hasSsoJwt: false });

    expect(
      await screen.findByText("Secure your embeds with single sign-on"),
    ).toBeInTheDocument();

    // The claim that matters: nothing configurable renders below the paywall.
    expect(
      screen.queryByText("JWT Identity Provider URI"),
    ).not.toBeInTheDocument();
  });

  it("mounts the admin JWT form when JWT is configured", async () => {
    setup({ hasSsoJwt: true, isJwtConfigured: true });

    expect(
      await screen.findByText("JWT Identity Provider URI"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Secure your embeds with single sign-on"),
    ).not.toBeInTheDocument();
  });

  it("shows the JWT form when nothing is configured yet", async () => {
    // The stepped setup flow lives in the setup guide, not here.
    setup({ hasSsoJwt: true });

    expect(
      await screen.findByText("JWT Identity Provider URI"),
    ).toBeInTheDocument();
  });

  it("sends the admin to admin settings when only SAML is configured", async () => {
    setup({ hasSsoJwt: true, isSamlConfigured: true });

    expect(await screen.findByText("SAML is configured")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Go to Admin/ })).toHaveAttribute(
      "href",
      "/admin/settings/authentication",
    );
    expect(
      screen.queryByText("JWT Identity Provider URI"),
    ).not.toBeInTheDocument();

    // The card's own link goes to the same page the banner would.
    expect(
      screen.queryByRole("link", { name: /Admin settings/ }),
    ).not.toBeInTheDocument();
  });

  it("prefers the JWT form when JWT and SAML are both configured", async () => {
    setup({ hasSsoJwt: true, isJwtConfigured: true, isSamlConfigured: true });

    expect(
      await screen.findByText("JWT Identity Provider URI"),
    ).toBeInTheDocument();
    expect(screen.queryByText("SAML is configured")).not.toBeInTheDocument();
  });

  it("points at admin for the other auth methods", async () => {
    setup({ hasSsoJwt: true, isJwtConfigured: true });

    await screen.findByText("JWT Identity Provider URI");

    expect(
      screen.getByRole("link", { name: /Admin settings/ }),
    ).toHaveAttribute("href", "/admin/settings/authentication");
  });
});
