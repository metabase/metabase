import { renderWithProviders, screen } from "__support__/ui";
import { Outlet, Route } from "metabase/router";

import { getDataStudioRoutes } from "./routes";

/**
 * These specs assert that the legacy redirects sit outside the Data Studio
 * access guard, so the guard is stubbed to always deny.
 */
jest.mock("./route-guards", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    CanAccessDataStudio: () => <div data-testid="data-studio-access-denied" />,
    CanAccessDataModel: () => <Outlet />,
  };
});

const AllowingGuard = () => <Outlet />;

function setup(initialRoute: string) {
  renderWithProviders(
    <Route path="/">
      {getDataStudioRoutes(AllowingGuard)}
      <Route
        path="monitor/dependency-diagnostics"
        element={<div data-testid="diagnostics-index" />}
      />
      <Route
        path="monitor/dependency-diagnostics/unreferenced"
        element={<div data-testid="diagnostics-unreferenced" />}
      />
    </Route>,
    { initialRoute, withRouter: true },
  );
}

describe("Data Studio routes", () => {
  it("redirects the legacy Dependency Diagnostics index outside the Data Studio access guard", async () => {
    setup("/data-studio/dependency-diagnostics");

    expect(await screen.findByTestId("diagnostics-index")).toBeInTheDocument();
    expect(
      screen.queryByTestId("data-studio-access-denied"),
    ).not.toBeInTheDocument();
  });

  it("preserves the child path instead of matching the Data Studio catch-all", async () => {
    setup("/data-studio/dependency-diagnostics/unreferenced");

    expect(
      await screen.findByTestId("diagnostics-unreferenced"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("data-studio-access-denied"),
    ).not.toBeInTheDocument();
  });
});
