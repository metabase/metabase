import { screen } from "__support__/ui";
import type { SearchSidebarSetupOptions } from "metabase/search/components/SearchSidebar/tests/setup";
import { setup } from "metabase/search/components/SearchSidebar/tests/setup";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

const setupPremium = async (opts?: SearchSidebarSetupOptions) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ content_verification: true }),
    hasEnterprisePlugins: true,
  });
};

describe("SearchFilterSidebar", () => {
  it("renders `Verified` filter", async () => {
    await setupPremium();

    expect(screen.getByTestId("verified-search-filter")).toBeInTheDocument();
  });
});
