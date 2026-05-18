import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { SearchButton } from "./SearchButton";

describe("SearchButton", () => {
  it("should show the current search query on the search page (UXW-3370)", () => {
    renderWithProviders(<Route path="*" component={() => <SearchButton />} />, {
      withKBar: true,
      withRouter: true,
      initialRoute: "/search?q=products",
    });

    expect(screen.getByRole("button", { name: /Search/ })).toHaveTextContent(
      "products",
    );
  });
});
