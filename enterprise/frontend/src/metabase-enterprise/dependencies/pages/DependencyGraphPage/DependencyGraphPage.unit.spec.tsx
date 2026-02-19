import { Route } from "react-router";

import {
  setupDependecyGraphEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { createMockDependencyGraph } from "metabase-types/api/mocks";

import { DependencyGraphPage } from "./DependencyGraphPage";

describe("DependencyGraphPage", () => {
  beforeEach(() => {
    setupDependecyGraphEndpoint(createMockDependencyGraph());
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  });
  it("should show an app switcher if there is no context", async () => {
    renderWithProviders(<Route path="/" component={DependencyGraphPage} />, {
      withRouter: true,
    });

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.getByTestId("app-switcher-target")).toBeInTheDocument();
  });

  it("should not show an app switcher if the context contains a base url", async () => {
    renderWithProviders(
      <Route
        path="/"
        component={() => (
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: "any-url",
              defaultEntry: { id: 2, type: "transform" },
            }}
          >
            <DependencyGraphPage />
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        )}
      />,
      {
        withRouter: true,
      },
    );

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.queryByTestId("app-switcher-target")).not.toBeInTheDocument();
  });
});
