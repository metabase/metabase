import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("SearchFilterSidebar", () => {
  it("should render all available filters", () => {
    setup();

    expect(screen.getByTestId("type-search-filter")).toBeInTheDocument();
  });
});
