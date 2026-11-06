import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("SearchFilterSidebar", () => {
  it("should render all available filters", () => {
    setup();

    expect(screen.getByTestId("type-search-filter")).toBeInTheDocument();
  });

  it("should not be exposed to non-admins", () => {
    setup({
      isAdmin: false,
      activeUsersCount: 2,
      value: { filter_items_in_personal_collection: "all" },
    });

    expect(screen.getByTestId("archived-search-filter")).toBeVisible();
    expect(
      screen.queryByTestId("filter_items_in_personal_collection-search-filter"),
    ).not.toBeInTheDocument();
  });

  it("should be exposed to admins when there are other users (positive control)", () => {
    setup({
      isAdmin: true,
      activeUsersCount: 2,
      value: { filter_items_in_personal_collection: "all" },
    });

    expect(screen.getByTestId("archived-search-filter")).toBeVisible();
    expect(
      screen.getByTestId("filter_items_in_personal_collection-search-filter"),
    ).toBeVisible();
  });
});
