import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
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

import { EmbeddingHubLocalizationPage } from "./EmbeddingHubLocalizationPage";

interface SetupOpts {
  hasContentTranslation?: boolean;
}

function setup({ hasContentTranslation = false }: SetupOpts = {}) {
  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      content_translation: hasContentTranslation,
    }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  // Settings before plugins: ContentTranslationConfiguration is registered
  // only when `hasPremiumFeature("content_translation")` is true.
  const storeSettings = mockSettings(settings);
  setupEnterprisePlugins();

  renderWithProviders(
    <Route path="/" element={<EmbeddingHubLocalizationPage />} />,
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

describe("EmbeddingHubLocalizationPage", () => {
  it("upsells when content translation is not licensed", async () => {
    setup({ hasContentTranslation: false });

    expect(
      await screen.findByText("Translate your embedded content"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Upload a translation dictionary to translate content such as item titles, headings, filter labels, and data in your embedded components.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Translate embedded dashboards and questions"),
    ).not.toBeInTheDocument();
  });

  it("mounts the dictionary configuration when licensed", async () => {
    setup({ hasContentTranslation: true });

    expect(
      await screen.findByText("Translate embedded dashboards and questions"),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Translate your embedded content"),
    ).not.toBeInTheDocument();
  });

  it("keeps the tab's own title on both editions", async () => {
    setup({ hasContentTranslation: false });

    expect(
      await screen.findByRole("heading", { name: "Localization" }),
    ).toBeInTheDocument();
  });
});
