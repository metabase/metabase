import { IndexRoute, Redirect, Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";

// Mirrors the legacy Dependency Diagnostics redirects declared in
// frontend/src/metabase/routes.tsx. The migration guarantees that the old
// /data-studio/dependency-diagnostics(/*) URLs keep working by redirecting to
// their /monitor equivalents; this exercises those redirect rules in isolation.
const setup = (initialRoute: string) => {
  renderWithProviders(
    <Route path="/">
      <Redirect
        from="/data-studio/dependency-diagnostics"
        to="/monitor/dependency-diagnostics"
      />
      <Redirect
        from="/data-studio/dependency-diagnostics/*"
        to="/monitor/dependency-diagnostics/*"
      />
      <Route path="monitor/dependency-diagnostics">
        <IndexRoute
          component={() => <div>{"Dependency diagnostics index"}</div>}
        />
        <Route
          path="broken"
          component={() => <div>{"Broken dependencies"}</div>}
        />
      </Route>
    </Route>,
    { withRouter: true, initialRoute },
  );
};

describe("Dependency Diagnostics legacy redirects", () => {
  it("redirects the old base URL to /monitor", async () => {
    setup("/data-studio/dependency-diagnostics");

    expect(
      await screen.findByText("Dependency diagnostics index"),
    ).toBeInTheDocument();
  });

  it("redirects old child URLs (e.g. /broken) to the /monitor equivalent", async () => {
    setup("/data-studio/dependency-diagnostics/broken");

    expect(await screen.findByText("Broken dependencies")).toBeInTheDocument();
  });
});
