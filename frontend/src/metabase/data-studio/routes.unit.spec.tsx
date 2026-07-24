import { setupUserKeyValueEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { DataStudioIndexRedirect, getDataStudioRoutes } from "./routes";

const DenyingDataStudioGuard = () => (
  <div data-testid="data-studio-access-denied" />
);
const AllowingGuard = () => <Outlet />;

function setup(initialRoute: string) {
  renderWithProviders(
    <Route path="/">
      {getDataStudioRoutes(
        DenyingDataStudioGuard,
        AllowingGuard,
        AllowingGuard,
      )}
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

function setupIndexRedirect({
  hasSeenGuide,
  isAdmin = false,
}: {
  hasSeenGuide: boolean;
  isAdmin?: boolean;
}) {
  setupUserKeyValueEndpoints({
    namespace: "data_studio",
    key: "hasSeenGuide",
    value: hasSeenGuide,
  });

  renderWithProviders(
    <Route path="/">
      <Route path="data-studio">
        <Route index element={<DataStudioIndexRedirect />} />
        <Route path="guide" element={<div data-testid="guide-page" />} />
        <Route path="data" element={<div data-testid="data-index" />} />
        <Route path="library" element={<div data-testid="library-index" />} />
        <Route
          path="transforms"
          element={<div data-testid="transforms-index" />}
        />
      </Route>
    </Route>,
    {
      withRouter: true,
      initialRoute: "/data-studio",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: isAdmin }),
      }),
    },
  );
}

describe("Data Studio index redirect", () => {
  it("sends first-time visitors to the guide without recording the visit itself", async () => {
    setupIndexRedirect({ hasSeenGuide: false, isAdmin: true });

    expect(await screen.findByTestId("guide-page")).toBeInTheDocument();
    expect(screen.queryByTestId("data-index")).not.toBeInTheDocument();
  });

  it("sends returning admins to their data index", async () => {
    setupIndexRedirect({ hasSeenGuide: true, isAdmin: true });

    expect(await screen.findByTestId("data-index")).toBeInTheDocument();
    expect(screen.queryByTestId("guide-page")).not.toBeInTheDocument();
  });

  it("sends returning non-admins to their computed index", async () => {
    setupIndexRedirect({ hasSeenGuide: true });

    expect(await screen.findByTestId("library-index")).toBeInTheDocument();
    expect(screen.queryByTestId("guide-page")).not.toBeInTheDocument();
  });
});
