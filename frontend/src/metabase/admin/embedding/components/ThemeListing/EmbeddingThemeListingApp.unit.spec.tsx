import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingThemeListingApp } from "./EmbeddingThemeListingApp";

const setup = ({
  hasSimpleEmbedding = false,
}: {
  hasSimpleEmbedding?: boolean;
} = {}) => {
  fetchMock.get("path:/api/embed-theme", []);

  const settings = createMockSettings({
    "token-features": createMockTokenFeatures({
      embedding_simple: hasSimpleEmbedding,
    }),
  });

  renderWithProviders(<EmbeddingThemeListingApp />, {
    storeInitialState: {
      currentUser: createMockUser({ is_superuser: true }),
      settings: createMockSettingsState(settings),
    },
  });
};

describe("EmbeddingThemeListingApp", () => {
  afterEach(() => {
    fetchMock.removeRoutes().clearHistory();
  });

  it("renders the themes upsell for OSS/starter users", async () => {
    setup({ hasSimpleEmbedding: false });

    expect(await screen.findByText("Create custom themes")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Themes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /New theme/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the themes listing for Pro users", async () => {
    setup({ hasSimpleEmbedding: true });

    expect(
      await screen.findByRole("heading", { name: "Themes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /New theme/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Create custom themes")).not.toBeInTheDocument();
  });

  it("does not request themes from the API when showing the upsell", async () => {
    setup({ hasSimpleEmbedding: false });

    await screen.findByText("Create custom themes");

    // Give RTK Query a chance to fire the request if it were going to.
    await waitFor(() => {
      expect(fetchMock.callHistory.calls("path:/api/embed-theme")).toHaveLength(
        0,
      );
    });
  });
});
