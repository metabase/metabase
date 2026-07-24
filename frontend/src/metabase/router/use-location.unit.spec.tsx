import { renderWithProviders, screen } from "__support__/ui";

import { Route } from "./route";
import { useLocation } from "./use-location";

function LocationProbe() {
  const location = useLocation();
  return (
    <div>
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="hash">{location.hash}</span>
      <span data-testid="keys">{Object.keys(location).sort().join(",")}</span>
      <span data-testid="state">{JSON.stringify(location.state)}</span>
    </div>
  );
}

describe("router/useLocation", () => {
  it("exposes the current location in v7 shape", () => {
    renderWithProviders(<Route path="foo/bar" element={<LocationProbe />} />, {
      withRouter: true,
      initialRoute: "/foo/bar?x=1&y=2#section",
    });

    expect(screen.getByTestId("pathname")).toHaveTextContent("/foo/bar");
    expect(screen.getByTestId("search")).toHaveTextContent("?x=1&y=2");
    expect(screen.getByTestId("hash")).toHaveTextContent("#section");
  });

  it("returns exactly the v7 Location fields, without v3's `query`", () => {
    renderWithProviders(<Route path="foo/bar" element={<LocationProbe />} />, {
      withRouter: true,
      initialRoute: "/foo/bar?x=1",
    });

    // v7's Location is exactly { pathname, search, hash, state, key }, no `query`.
    expect(screen.getByTestId("keys")).toHaveTextContent(
      /^hash,key,pathname,search,state$/,
    );
  });

  it("defaults state to null like v7 (not v3's undefined)", () => {
    renderWithProviders(<Route path="foo/bar" element={<LocationProbe />} />, {
      withRouter: true,
      initialRoute: "/foo/bar",
    });

    expect(screen.getByTestId("state")).toHaveTextContent(/^null$/);
  });
});
