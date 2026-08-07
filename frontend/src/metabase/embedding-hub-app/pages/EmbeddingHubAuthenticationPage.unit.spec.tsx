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
}

function setup({ hasSsoJwt = false }: SetupOpts = {}) {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({ sso_jwt: hasSsoJwt }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();
  setupGroupsEndpoint([createMockGroup()]);

  // Settings before plugins: PLUGIN_AUTH_PROVIDERS.SettingsJWTForm is only
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

  it("mounts the admin JWT form when SSO is licensed", async () => {
    setup({ hasSsoJwt: true });

    expect(
      await screen.findByText("JWT Identity Provider URI"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Secure your embeds with single sign-on"),
    ).not.toBeInTheDocument();
  });

  it("points at admin for the other auth methods", async () => {
    setup({ hasSsoJwt: true });

    await screen.findByText("JWT Identity Provider URI");

    expect(
      screen.getByRole("link", { name: /Admin settings/ }),
    ).toHaveAttribute("href", "/admin/settings/authentication");
  });
});
