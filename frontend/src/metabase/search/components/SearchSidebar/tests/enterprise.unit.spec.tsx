import { screen } from "__support__/ui";

import type { SearchSidebarSetupOptions } from "./setup";
import { setup } from "./setup";

const setupEnterprise = async (opts?: SearchSidebarSetupOptions) => {
  setup({
    ...opts,
    hasEnterprisePlugins: true,
  });
};

describe("SearchFilterSidebar", () => {
  it("should not render `Verified` filter when content_verification plugin is not enabled", async () => {
    await setupEnterprise();

    expect(
      screen.queryByTestId("verified-search-filter"),
    ).not.toBeInTheDocument();
  });
});
