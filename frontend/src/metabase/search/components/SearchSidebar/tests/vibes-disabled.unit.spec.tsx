import { screen } from "__support__/ui";
import { setup } from "metabase/search/components/SearchSidebar/tests/setup";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

describe("SearchFilterSidebar vibes toggle (hidden)", () => {
  it("does not render the toggle when vibes are not enabled", () => {
    setup({
      tokenFeatures: createMockTokenFeatures({ semantic_search: true }),
      settings: { "vibes-enabled": false },
      enterprisePlugins: ["semantic_search"],
    });

    expect(screen.queryByTestId("vibes-search-filter")).not.toBeInTheDocument();
  });

  it("does not render the toggle without the semantic_search feature", () => {
    setup({
      settings: { "vibes-enabled": true },
      enterprisePlugins: ["semantic_search"],
    });

    expect(screen.queryByTestId("vibes-search-filter")).not.toBeInTheDocument();
  });
});
