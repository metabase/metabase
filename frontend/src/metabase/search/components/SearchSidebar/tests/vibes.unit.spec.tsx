import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import type { SearchSidebarSetupOptions } from "metabase/search/components/SearchSidebar/tests/setup";
import { setup } from "metabase/search/components/SearchSidebar/tests/setup";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

// The plugin registers the filter once per module, so the cases where it must stay hidden live in
// vibes-disabled.unit.spec.tsx.
const setupVibes = (opts?: SearchSidebarSetupOptions) => {
  setup({
    ...opts,
    tokenFeatures: createMockTokenFeatures({ semantic_search: true }),
    settings: { "vibes-enabled": true },
    enterprisePlugins: ["semantic_search"],
  });
};

describe("SearchFilterSidebar vibes toggle (enabled)", () => {
  it("renders `Order by vibes` when the instance has vibes enabled", () => {
    setupVibes();

    expect(screen.getByTestId("vibes-search-filter")).toBeInTheDocument();
    expect(screen.getByText("Order by vibes")).toBeInTheDocument();
  });

  it("writes vibes=true to the filters when toggled on", async () => {
    const onChange = jest.fn();
    setupVibes({ onChange });

    await userEvent.click(
      screen.getByRole("switch", { name: "Order by vibes" }),
    );

    expect(onChange).toHaveBeenCalledWith({ vibes: "true" });
  });

  it("drops the vibes filter when toggled off", async () => {
    const onChange = jest.fn();
    setupVibes({ value: { vibes: "true" }, onChange });

    await userEvent.click(
      screen.getByRole("switch", { name: "Order by vibes" }),
    );

    expect(onChange).toHaveBeenCalledWith({});
  });
});
