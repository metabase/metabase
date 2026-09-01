import { lazyLoaders } from "__support__/lazy-routes";
import { setupUserKeyValueEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { DataStudioIndexRedirect, getDataStudioRoutes } from "./routes";

const Guard = () => null;
describe("data-studio routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDataStudioRoutes(Guard));

    // Includes the transform, data model, glossary and settings routes, which
    // this tree nests.
    expect(loaders).toHaveLength(39);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
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
