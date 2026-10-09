import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { lazyLoaders } from "__support__/lazy-routes";
import {
  setupDependencyCountsEndpoint,
  setupDependencyCountsErrorEndpoint,
  setupListBreakingGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Outlet, Route } from "metabase/router";
import * as Urls from "metabase/urls";
import {
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { getDependencyDiagnosticsRoutes } from "./routes";

interface SetupOpts {
  countsError?: boolean;
}

function setup({ countsError = false }: SetupOpts = {}) {
  if (countsError) {
    setupDependencyCountsErrorEndpoint();
  } else {
    setupDependencyCountsEndpoint(
      { breaking: 137, unreferenced: 0 },
      { name: "dependency-counts" },
    );
  }
  setupListBreakingGraphNodesEndpoint(
    createMockListBrokenGraphNodesResponse({ data: [], total: 0 }),
  );
  setupListUnreferencedGraphNodesEndpoint(
    createMockListUnreferencedGraphNodesResponse({ data: [], total: 0 }),
  );
  for (const key of ["broken", "unreferenced"]) {
    setupUserKeyValueEndpoints({
      namespace: "dependency_diagnostics",
      key,
      value: {},
    });
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <>
      <Route
        path={Urls.dependencyDiagnostics()}
        element={
          <MonitorContent>
            <Outlet />
          </MonitorContent>
        }
      >
        {getDependencyDiagnosticsRoutes()}
      </Route>
      <Route path="/outside" element={<div>Outside the section</div>} />
    </>,
    {
      withRouter: true,
      initialRoute: Urls.brokenDependencies(),
      storeInitialState: { currentUser: createMockUser() },
    },
  );
}

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/dependencies/counts");
const getBrokenTab = () =>
  screen.getByRole("link", { name: "Broken dependencies" });

async function switchTab(name: string, emptyState: string) {
  await userEvent.click(screen.getByRole("link", { name }));
  expect(await screen.findByText(emptyState)).toBeVisible();
}

describe("dependency diagnostics routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDependencyDiagnosticsRoutes());
    expect(loaders).toHaveLength(2);
    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });

  it.each([false, true])(
    "does not refetch counts on tab switches (countsError: %s)",
    async (countsError) => {
      setup({ countsError });
      expect(
        await screen.findByText("No broken dependencies found"),
      ).toBeVisible();
      await waitFor(() =>
        expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0),
      );
      expect(within(getBrokenTab()).queryByText("137") !== null).toBe(
        !countsError,
      );

      for (let visit = 0; visit < 2; visit++) {
        await switchTab(
          "Unreferenced entities",
          "No unreferenced entities found",
        );
        await switchTab("Broken dependencies", "No broken dependencies found");
      }
      expect(getCountCalls()).toHaveLength(1);
    },
  );

  it("refreshes cached counts when reentering the section", async () => {
    const { router } = setup();
    const brokenTab = await screen.findByRole("link", {
      name: "Broken dependencies",
    });
    expect(await within(brokenTab).findByText("137")).toBeVisible();
    act(() => router?.navigate("/outside"));
    expect(await screen.findByText("Outside the section")).toBeVisible();
    fetchMock.modifyRoute("dependency-counts", {
      response: { breaking: 138, unreferenced: 0 },
    });
    act(() => router?.navigate(Urls.unreferencedDependencies()));
    expect(
      await screen.findByText("No unreferenced entities found"),
    ).toBeVisible();
    expect(await within(getBrokenTab()).findByText("138")).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
    await switchTab("Broken dependencies", "No broken dependencies found");
    expect(getCountCalls()).toHaveLength(2);
  });
});
