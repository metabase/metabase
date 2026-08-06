import userEvent from "@testing-library/user-event";

import {
  setupDependencyGraphEndpoint,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { findRequests } from "__support__/server-mocks/util";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockDependencyGraph } from "metabase-types/api/mocks";

import { DependencyGraphPage } from "./DependencyGraphPage";

describe("DependencyGraphPage", () => {
  beforeEach(() => {
    setupDependencyGraphEndpoint(createMockDependencyGraph());
    setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
    setupSearchEndpoints([]);
  });

  const searchFor = async (query: string) => {
    await userEvent.type(
      await screen.findByTestId("graph-entry-search-input"),
      query,
    );
    await waitFor(async () => {
      const requests = await findSearchRequests();
      expect(requests.length).toBeGreaterThan(0);
    });
  };

  const findSearchRequests = async () => {
    const gets = await findRequests("GET");
    return gets.filter((req) => req.url.includes("/api/search"));
  };

  const findRecentsRequests = async () => {
    const gets = await findRequests("GET");
    return gets.filter((req) => req.url.includes("/api/activity/recents"));
  };
  it("should show an app switcher if there is no context", async () => {
    renderWithProviders(<Route path="/" element={<DependencyGraphPage />} />, {
      withRouter: true,
    });

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.getByTestId("app-switcher-target")).toBeInTheDocument();
  });

  it("should not show an app switcher inside a worktree", async () => {
    renderWithProviders(
      <Route
        path="/"
        element={
          <WorktreeProvider worktreeId={7}>
            <DependencyGraphPage />
          </WorktreeProvider>
        }
      />,
      {
        withRouter: true,
      },
    );

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.queryByTestId("app-switcher-target")).not.toBeInTheDocument();
  });

  it("should scope entry search to the worktree and skip recents", async () => {
    renderWithProviders(
      <Route
        path="/"
        element={
          <WorktreeProvider worktreeId={7}>
            <DependencyGraphPage />
          </WorktreeProvider>
        }
      />,
      {
        withRouter: true,
      },
    );

    await searchFor("Orders");
    const searchRequests = await findSearchRequests();
    searchRequests.forEach((req) => {
      expect(req.url).toContain("worktree-id=7");
    });
    expect(await findRecentsRequests()).toHaveLength(0);
  });

  it("should not scope entry search outside a worktree", async () => {
    renderWithProviders(<Route path="/" element={<DependencyGraphPage />} />, {
      withRouter: true,
    });

    await searchFor("Orders");
    const searchRequests = await findSearchRequests();
    searchRequests.forEach((req) => {
      expect(req.url).not.toContain("worktree-id");
    });
    expect((await findRecentsRequests()).length).toBeGreaterThan(0);
  });

  it("should not show an app switcher if the context contains a base url", async () => {
    renderWithProviders(
      <Route
        path="/"
        element={
          <PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider
            value={{
              baseUrl: "any-url",
              defaultEntry: { id: 2, type: "transform" },
            }}
          >
            <DependencyGraphPage />
          </PLUGIN_DEPENDENCIES.DependencyGraphPageContext.Provider>
        }
      />,
      {
        withRouter: true,
      },
    );

    expect(await screen.findByTestId("dependency-graph")).toBeInTheDocument();
    expect(screen.queryByTestId("app-switcher-target")).not.toBeInTheDocument();
  });
});
