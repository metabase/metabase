import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";
import type { URLSearchFilterQueryParams } from "metabase/common/search/types";
import type { SearchSidebarSetupOptions } from "metabase/search/components/SearchSidebar/tests/setup";
import { setup } from "metabase/search/components/SearchSidebar/tests/setup";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

const setupPremium = async (opts?: SearchSidebarSetupOptions) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ content_verification: true }),
    enterprisePlugins: ["content_verification"],
  });
};

describe("SearchFilterSidebar", () => {
  it("renders `Verified` filter", async () => {
    await setupPremium();

    expect(screen.getByTestId("verified-search-filter")).toBeInTheDocument();
  });

  it("should turn on the `Verified` filter", async () => {
    const onChange = jest.fn<void, [URLSearchFilterQueryParams]>();
    await setupPremium({ value: { search_native_query: "true" }, onChange });

    const toggle = within(
      screen.getByTestId("verified-search-filter"),
    ).getByRole("switch");
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith({
      search_native_query: "true",
      verified: "true",
    });
  });

  it("should hydrate the `Verified` filter from the URL and turn it off", async () => {
    const onChange = jest.fn<void, [URLSearchFilterQueryParams]>();
    await setupPremium({
      value: { search_native_query: "true", verified: "true" },
      onChange,
    });

    const toggle = within(
      screen.getByTestId("verified-search-filter"),
    ).getByRole("switch");
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith({ search_native_query: "true" });
  });
});
