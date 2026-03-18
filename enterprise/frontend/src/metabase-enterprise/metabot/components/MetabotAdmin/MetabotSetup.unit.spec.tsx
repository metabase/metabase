import { Route } from "react-router";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockTokenFeatures } from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MetabotSetup } from "./MetabotSetup";

jest.mock("./MetabotNavPane", () => ({
  MetabotNavPane: () => <div>Metabot navigation</div>,
}));

jest.mock("./MetabotProviderSection", () => ({
  MetabotProviderSection: () => <div>Provider section</div>,
}));

jest.mock("./MetabotEmbeddingProviderSection", () => ({
  MetabotEmbeddingProviderSection: () => <div>Embedding provider section</div>,
}));

jest.mock("./MetabotSemanticSearchSection", () => ({
  MetabotSemanticSearchSection: () => <div>Semantic search section</div>,
}));

const setup = ({
  hasSemanticSearchFeature = false,
  isHosted = false,
}: {
  hasSemanticSearchFeature?: boolean;
  isHosted?: boolean;
} = {}) =>
  renderWithProviders(
    <Route path="/admin/metabot*" component={MetabotSetup} />,
    {
      withRouter: true,
      initialRoute: "/admin/metabot/setup",
      storeInitialState: {
        settings: createMockSettingsState({
          "is-hosted?": isHosted,
          "token-features": createMockTokenFeatures({
            semantic_search: hasSemanticSearchFeature,
          }),
        }),
      },
    },
  );

describe("MetabotSetup", () => {
  it("should only show Semantic Search when the feature is enabled", () => {
    const { unmount } = setup({ hasSemanticSearchFeature: false });

    expect(
      screen.queryByText("Semantic Search (Optional)"),
    ).not.toBeInTheDocument();

    unmount();

    setup({ hasSemanticSearchFeature: true });

    expect(screen.getByText("Semantic Search (Optional)")).toBeInTheDocument();
    expect(screen.getByText("Embedding provider section")).toBeInTheDocument();
    expect(screen.getByText("Semantic search section")).toBeInTheDocument();
  });

  it("should redirect to the hosted Metabot page when hosted", async () => {
    const { history } = setup({ isHosted: true });

    await waitFor(() => {
      expect(history?.getCurrentLocation()?.pathname).toBe("/admin/metabot/");
    });
  });
});
