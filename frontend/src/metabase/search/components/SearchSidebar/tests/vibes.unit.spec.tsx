import userEvent from "@testing-library/user-event";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { act, screen } from "__support__/ui";
import type { SearchSidebarSetupOptions } from "metabase/search/components/SearchSidebar/tests/setup";
import { setup } from "metabase/search/components/SearchSidebar/tests/setup";
import { refetchSiteSettings } from "metabase/settings";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

const setupVibes = (opts?: SearchSidebarSetupOptions) => {
  return setup({
    tokenFeatures: createMockTokenFeatures({ semantic_search: true }),
    settings: { "vibes-enabled": true },
    enterprisePlugins: ["semantic_search"],
    ...opts,
  });
};

describe("SearchFilterSidebar vibes toggle (enabled)", () => {
  it("shows the toggle when authenticated settings arrive after plugin initialization", async () => {
    const { store } = setupVibes({ settings: { "vibes-enabled": undefined } });

    expect(screen.queryByTestId("vibes-search-filter")).not.toBeInTheDocument();

    setupPropertiesEndpoints(
      createMockSettings({
        "token-features": createMockTokenFeatures({ semantic_search: true }),
        "vibes-enabled": true,
      }),
    );
    await act(async () => {
      await store.dispatch(refetchSiteSettings()).unwrap();
    });

    expect(
      await screen.findByRole("switch", { name: "Order by vibes" }),
    ).not.toBeChecked();
  });

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
