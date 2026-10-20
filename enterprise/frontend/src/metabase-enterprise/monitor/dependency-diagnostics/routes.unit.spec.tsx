import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { lazyLoaders } from "__support__/lazy-routes";
import {
  setupDeleteCardEndpoint,
  setupDependencyCountsEndpoint,
  setupDependencyCountsErrorEndpoint,
  setupListBreakingGraphNodesEndpoint,
  setupListUnreferencedGraphNodesEndpoint,
  setupUpdateCollectionEndpoint,
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
import {
  useDeleteCardMutation,
  useUpdateCollectionMutation,
} from "metabase/api";
import { MonitorContent } from "metabase/monitor/components/MonitorLayout/MonitorContent";
import { Outlet, Route } from "metabase/router";
import { Button } from "metabase/ui";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type {
  DependencyCountsResponse,
  DependencyNode,
} from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCardDependencyNodeData,
  createMockCollection,
  createMockListBrokenGraphNodesResponse,
  createMockListUnreferencedGraphNodesResponse,
  createMockUser,
} from "metabase-types/api/mocks";

import { getDependencyDiagnosticsRoutes } from "./routes";

const COUNTS: DependencyCountsResponse = { breaking: 137, unreferenced: 0 };

interface SetupOpts {
  nodes?: DependencyNode[];
  total?: number;
  initialRoute?: string;
  countsResponse?: DependencyCountsResponse | Promise<DependencyCountsResponse>;
  withMutations?: boolean;
  withCountsError?: boolean;
}

function DeleteQuestionButton() {
  const [deleteCard] = useDeleteCardMutation();
  const handleDelete = async () => {
    await deleteCard(1).unwrap();
  };
  return <Button onClick={handleDelete}>Delete question</Button>;
}

function ArchiveCollectionButton() {
  const [updateCollection] = useUpdateCollectionMutation();
  const handleArchive = async () => {
    await updateCollection({ id: 1, archived: true }).unwrap();
  };
  return <Button onClick={handleArchive}>Archive collection</Button>;
}

function setup({
  nodes = [],
  total = nodes.length,
  initialRoute = Urls.brokenDependencies(),
  countsResponse = COUNTS,
  withMutations = false,
  withCountsError = false,
}: SetupOpts = {}) {
  if (withCountsError) {
    setupDependencyCountsErrorEndpoint();
  } else {
    setupDependencyCountsEndpoint(() => countsResponse, {
      name: "dependency-counts",
    });
  }
  setupListBreakingGraphNodesEndpoint(
    createMockListBrokenGraphNodesResponse({ data: nodes, total }),
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
  if (withMutations) {
    setupDeleteCardEndpoint(1);
    setupUpdateCollectionEndpoint(
      createMockCollection({ id: 1, archived: true }),
    );
  }
  mockGetBoundingClientRect({ width: 100, height: 100 });

  return renderWithProviders(
    <Route
      path={Urls.dependencyDiagnostics()}
      element={
        <MonitorContent>
          {withMutations && (
            <>
              <DeleteQuestionButton />
              <ArchiveCollectionButton />
            </>
          )}
          <Outlet />
        </MonitorContent>
      }
    >
      {getDependencyDiagnosticsRoutes()}
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: { currentUser: createMockUser() },
    },
  );
}

const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/dependencies/counts");
const getTab = (name: string) => screen.getByRole("link", { name });

async function switchTab(name: string, emptyState: string) {
  await userEvent.click(getTab(name));
  expect(await screen.findByText(emptyState)).toBeVisible();
  expect(getTab(name)).toHaveAttribute("aria-current", "page");
}

async function visitBothTabs() {
  await switchTab("Unreferenced entities", "No unreferenced entities found");
  await switchTab("Broken dependencies", "No broken dependencies found");
}

describe("dependency diagnostics routes", () => {
  it("resolves every page", async () => {
    const loaders = lazyLoaders(getDependencyDiagnosticsRoutes());

    expect(loaders).toHaveLength(2);

    for (const load of loaders) {
      expect((await load()).Component).toBeDefined();
    }
  });
});

describe("dependency diagnostics section counts", () => {
  it("maps both default populations and reuses counts across tab cycles", async () => {
    setup();
    expect(
      await screen.findByText("No broken dependencies found"),
    ).toBeVisible();
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeVisible();
    expect(
      within(getTab("Unreferenced entities")).getByText("0"),
    ).toBeVisible();

    await visitBothTabs();
    await visitBothTabs();

    expect(getCountCalls()).toHaveLength(1);
  });

  it("counts the default lists, independent of the filtered and paginated list", async () => {
    setup({
      nodes: [
        createMockCardDependencyNode({
          id: 1,
          data: createMockCardDependencyNodeData({ name: "Sales question" }),
        }),
      ],
      total: 60,
      initialRoute: Urls.brokenDependencies({
        page: 1,
        query: "Sales",
        includePersonalCollections: false,
      }),
    });
    expect(await screen.findByText("Sales question")).toBeVisible();
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeVisible();
    const calls = getCountCalls();
    expect(calls).toHaveLength(1);
    const countParams = new URL(calls[0].url).searchParams;
    expect(
      Object.fromEntries(
        [...new Set(countParams.keys())].map((key) => [
          key,
          countParams.getAll(key),
        ]),
      ),
    ).toEqual({
      "breaking-types": ["table", "card", "transform"],
      "breaking-card-types": ["question", "model"],
      "breaking-include-personal-collections": ["true"],
      "unreferenced-types": ["table", "card", "segment", "measure", "snippet"],
      "unreferenced-card-types": ["question", "model", "metric"],
      "unreferenced-include-personal-collections": ["true"],
    });
    const listCalls = fetchMock.callHistory.calls(
      "path:/api/ee/dependencies/graph/breaking",
    );
    expect(listCalls).toHaveLength(1);
    const params = new URL(listCalls[0].url).searchParams;
    expect(params.get("query")).toBe("Sales");
    expect(params.get("offset")).toBe("25");
    expect(params.get("limit")).toBe("25");
    expect(params.get("include-personal-collections")).toBe("false");
  });

  it("keeps navigation working and hides badges when counts fail", async () => {
    setup({ withCountsError: true });
    expect(
      await screen.findByText("No broken dependencies found"),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        fetchMock.callHistory.done("path:/api/ee/dependencies/counts"),
      ).toBe(true),
    );
    await visitBothTabs();
    await waitFor(() =>
      expect(
        within(getTab("Broken dependencies")).queryByTestId(
          "tab-count-skeleton",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(getTab("Broken dependencies")).toHaveTextContent(
      /^Broken dependencies$/,
    );
  });

  it("shares the pending count request without blocking tab navigation", async () => {
    const pendingCounts = defer<DependencyCountsResponse>();
    setup({ countsResponse: pendingCounts.promise });
    expect(
      await screen.findByText("No broken dependencies found"),
    ).toBeVisible();
    await visitBothTabs();
    expect(getCountCalls()).toHaveLength(1);
    await act(async () => pendingCounts.resolve(COUNTS));
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeVisible();
    await switchTab("Unreferenced entities", "No unreferenced entities found");
    expect(getCountCalls()).toHaveLength(1);
  });

  it("retains counts across tab changes while a question deletion refreshes them", async () => {
    const pendingCounts = defer<DependencyCountsResponse>();
    setup({ withMutations: true });
    expect(
      await screen.findByText("No broken dependencies found"),
    ).toBeVisible();
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeVisible();
    fetchMock.modifyRoute("dependency-counts", {
      response: () => pendingCounts.promise,
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Delete question" }),
    );
    await waitFor(() => expect(getCountCalls()).toHaveLength(2));
    await switchTab("Unreferenced entities", "No unreferenced entities found");
    expect(
      within(getTab("Broken dependencies")).getByText("137"),
    ).toBeVisible();
    await act(async () =>
      pendingCounts.resolve({ breaking: 136, unreferenced: 1 }),
    );
    expect(
      await within(getTab("Broken dependencies")).findByText("136"),
    ).toBeVisible();
    expect(
      within(getTab("Unreferenced entities")).getByText("1"),
    ).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
  });

  it("refreshes counts when a collection is archived", async () => {
    setup({ withMutations: true });
    expect(
      await screen.findByText("No broken dependencies found"),
    ).toBeVisible();
    expect(
      await within(getTab("Broken dependencies")).findByText("137"),
    ).toBeVisible();
    fetchMock.modifyRoute("dependency-counts", {
      response: { breaking: 0, unreferenced: 4 },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Archive collection" }),
    );
    expect(
      await within(getTab("Unreferenced entities")).findByText("4"),
    ).toBeVisible();
    expect(within(getTab("Broken dependencies")).getByText("0")).toBeVisible();
    expect(getCountCalls()).toHaveLength(2);
  });
});
