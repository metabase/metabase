import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
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

import { EmbeddingHubAppearancePage } from "./EmbeddingHubAppearancePage";

interface SetupOpts {
  hasSimpleEmbedding?: boolean;
  isFullAppEmbeddingEnabled?: boolean;
}

function setup({
  hasSimpleEmbedding = false,
  isFullAppEmbeddingEnabled = false,
}: SetupOpts = {}) {
  fetchMock.get("path:/api/embed-theme", []);

  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
      // The two halves of the tab gate on different features but arrive
      // together in practice, so the licensed case licenses both.
      whitelabel: hasSimpleEmbedding,
    }),
    "enable-embedding-interactive": isFullAppEmbeddingEnabled,
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);
  setupUpdateSettingEndpoint();

  // Settings before plugins: PLUGIN_WHITELABEL.EmbeddedAppearanceSettings is
  // registered only when `hasPremiumFeature("whitelabel")` is true.
  const storeSettings = mockSettings(settings);
  setupEnterprisePlugins();

  renderWithProviders(
    <Route path="/" element={<EmbeddingHubAppearancePage />} />,
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

describe("EmbeddingHubAppearancePage", () => {
  it("upsells and shows neither section below the paywall", async () => {
    setup({ hasSimpleEmbedding: false });

    expect(await screen.findByText("Create custom themes")).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", { name: "Themes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Branding elements" }),
    ).not.toBeInTheDocument();
  });

  it("shows both the theme listing and the branding settings when licensed", async () => {
    setup({ hasSimpleEmbedding: true });

    expect(
      await screen.findByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Themes" })).toBeInTheDocument();

    // The EE slot's own content, not just its heading -- an unregistered slot
    // would leave the heading and render nothing under it.
    expect(
      screen.getByRole("heading", { name: "Branding elements" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Loading message")).toBeInTheDocument();

    expect(screen.queryByText("Create custom themes")).not.toBeInTheDocument();
  });

  it("hides the full-app banner when full-app embedding is off", async () => {
    setup({ hasSimpleEmbedding: true, isFullAppEmbeddingEnabled: false });

    await screen.findByRole("button", { name: /New theme/ });

    expect(screen.queryByText(/Full-app embedding/)).not.toBeInTheDocument();
  });

  it("points the full-app banner at admin when full-app embedding is on", async () => {
    setup({ hasSimpleEmbedding: true, isFullAppEmbeddingEnabled: true });

    expect(await screen.findByText(/Full-app embedding/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Admin/ })).toHaveAttribute(
      "href",
      "/admin/settings/whitelabel",
    );
  });
});
