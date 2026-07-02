import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

import { useLocation } from "./use-location";

function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="hash">{location.hash}</span>
    </div>
  );
}

describe("useLocation", () => {
  it("exposes the current v3 location in v7 shape", () => {
    renderWithProviders(<Route path="foo/bar" component={LocationProbe} />, {
      withRouter: true,
      initialRoute: "/foo/bar?x=1&y=2#section",
    });

    expect(screen.getByTestId("pathname")).toHaveTextContent("/foo/bar");
    expect(screen.getByTestId("search")).toHaveTextContent("?x=1&y=2");
    expect(screen.getByTestId("hash")).toHaveTextContent("#section");
  });
});
