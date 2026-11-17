import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRecentViewsEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHubThemeEditorPage } from "./EmbeddingHubThemeEditorPage";

interface SetupOpts {
  hasSimpleEmbedding?: boolean;
  route?: string;
}

function setup({
  hasSimpleEmbedding = true,
  route = "/embedding/appearance/theme/new",
}: SetupOpts = {}) {
  fetchMock.get("path:/api/embed-theme", []);
  setupRecentViewsEndpoints([]);
  // With no recents, the preview panel falls back to searching for a dashboard.
  fetchMock.get("path:/api/search", { data: [], total: 0 });

  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
    }),
  });

  setupPropertiesEndpoints(settings);
  setupSettingsEndpoints([]);

  renderWithProviders(
    <>
      <Route
        path="/embedding/appearance/theme/:themeId"
        element={<EmbeddingHubThemeEditorPage />}
      />
      <Route path="/embedding/appearance" element={<div>Appearance</div>} />
      <Route path="/embedding/get-started" element={<div>Get started</div>} />
    </>,
    {
      withRouter: true,
      initialRoute: route,
      storeInitialState: createMockState({
        settings: mockSettings(settings),
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("EmbeddingHubThemeEditorPage", () => {
  it("redirects to Appearance without embedding_simple", async () => {
    setup({ hasSimpleEmbedding: false });

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
  });

  it("renders the editor when licensed", async () => {
    setup();

    expect(await screen.findByText("Edit theme")).toBeInTheDocument();
  });

  it("ignores a return value it does not recognize", async () => {
    setup({ route: "/embedding/appearance/theme/new?return=somewhere-else" });

    expect(await screen.findByText("Edit theme")).toBeInTheDocument();
    expect(screen.queryByText("Get started")).not.toBeInTheDocument();
  });
});
