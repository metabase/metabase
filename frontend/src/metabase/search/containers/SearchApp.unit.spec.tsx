import { renderWithProviders, screen } from "__support__/ui";
import SearchApp from "metabase/search/containers/SearchApp";
import { Route } from "metabase/hoc/Title";

const setup = () => {
  renderWithProviders(<Route path="search" component={SearchApp} />, {
    withRouter: true,
    initialRoute: "/search",
  });
};

describe("SearchApp", () => {
  it("should do something", () => {
    setup();
    screen.debug(undefined, 100000);
  });
});
