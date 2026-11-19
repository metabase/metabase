import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { renderWithRouter } from "__support__/router";
import { Route, useLocation } from "metabase/router";

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
    renderWithRouter(<Route path="foo/bar" element={<LocationProbe />} />, {
      initialRoute: "/foo/bar?x=1&y=2#section",
    });

    expect(screen.getByTestId("pathname")).toHaveTextContent("/foo/bar");
    expect(screen.getByTestId("search")).toHaveTextContent("?x=1&y=2");
    expect(screen.getByTestId("hash")).toHaveTextContent("#section");
  });

  it("does not carry v3's `query` and `action` fields", () => {
    renderWithRouter(<Route path="foo/bar" element={<LocationProbe />} />, {
      initialRoute: "/foo/bar?x=1",
    });

    const keys = screen.getByTestId("keys").textContent?.split(",");
    expect(keys).toEqual(
      expect.arrayContaining(["pathname", "search", "hash"]),
    );
    expect(keys).not.toContain("query");
    expect(keys).not.toContain("action");
  });

  it("defaults state to null like v7 (not v3's undefined)", () => {
    renderWithRouter(<Route path="foo/bar" element={<LocationProbe />} />, {
      initialRoute: "/foo/bar",
    });

    expect(screen.getByTestId("state")).toHaveTextContent(/^null$/);
  });

  it("works above the route tree, where the facade context is not published", () => {
    render(
      <MemoryRouter initialEntries={["/foo/bar?x=1"]}>
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("pathname")).toHaveTextContent("/foo/bar");
    expect(screen.getByTestId("search")).toHaveTextContent("?x=1");
  });
});
