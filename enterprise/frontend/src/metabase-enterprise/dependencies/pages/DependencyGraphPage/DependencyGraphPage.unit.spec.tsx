import React from "react";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";

import { DependencyGraphPage } from "./DependencyGraphPage";

jest.mock("../../components/DependencyGraph", () => ({
  DependencyGraph: () => <p>Dependency Graph</p>,
}));

describe("DependencyGraphPage", () => {
  it("should show an app switcher if there is no context", async () => {
    renderWithProviders(<Route path="/" component={DependencyGraphPage} />, {
      withRouter: true,
    });

    expect(await screen.findByText("Dependency Graph")).toBeInTheDocument();
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

    expect(await screen.findByText("Dependency Graph")).toBeInTheDocument();
    expect(screen.queryByTestId("app-switcher-target")).not.toBeInTheDocument();
  });
});
