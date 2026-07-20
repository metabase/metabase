import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  DEFAULT_SORT_ORDER,
  type ExplorationSortOrder,
} from "metabase/explorations/sidebar-preferences";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import type { ExplorationSidebarTab } from "metabase/explorations/types";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ExplorationBlockNode,
  ExplorationQuery,
  ExplorationThread,
} from "metabase-types/api";

import { ExplorationSidebar } from "./ExplorationSidebar";
import {
  getExplorationSidebarTabsInfo,
  getExplorationSidebarTree,
  isHiddenTreeItem,
} from "./utils";

function getSidebarTestContext(
  exploration: ReturnType<typeof createExploration>,
  selectedSidebarTab: ExplorationSidebarTab = "all",
) {
  const path = Urls.exploration(exploration.id);
  const explorationSidebarTabsInfo = getExplorationSidebarTabsInfo(exploration);
  const getSelectedSidebarTabUrl = (tab: ExplorationSidebarTab) =>
    `${path}?tab=${tab}`;
  const treeItemFilter =
    explorationSidebarTabsInfo[selectedSidebarTab].treeItemFilter;

  return {
    path,
    explorationSidebarTabsInfo,
    selectedSidebarTab,
    getSelectedSidebarTabUrl,
    treeItemFilter,
    getTree: () => getExplorationSidebarTree(exploration, treeItemFilter),
  };
}

type TestSelectedPageId = string | null;

interface SetupOpts {
  queries: ExplorationQuery[];
  blocks?: ExplorationBlockNode[];
  thread?: Partial<ExplorationThread>;
  selectedQueryId?: number | null;
  selectedPageId?: TestSelectedPageId;
  prompt?: string | null;
  canWrite?: boolean;
  showHidden?: boolean;
  sortOrder?: ExplorationSortOrder;
  readPageIds?: ReadonlySet<string>;
  tab?: ExplorationSidebarTab;
}

function setup({
  queries,
  blocks,
  thread,
  selectedQueryId = null,
  selectedPageId,
  prompt = null,
  canWrite = true,
  showHidden = false,
  sortOrder = DEFAULT_SORT_ORDER,
  readPageIds = new Set<string>(),
  tab = "all",
}: SetupOpts) {
  const setSelectedPageId = jest.fn();
  const onToggleShowHidden = jest.fn();
  const onChangeSortOrder = jest.fn();

  fetchMock.get("express:/api/exploration/query/:id", {
    data: { rows: [], cols: [] },
  });
  fetchMock.post("path:/api/dataset/query_metadata", {
    databases: [],
    tables: [],
    fields: [],
  });

  const exploration = createExploration({
    queries,
    blocks,
    prompt,
    thread,
  });
  exploration.can_write = canWrite;

  const allPages = (exploration.threads ?? []).flatMap((t) =>
    (t.blocks ?? []).flatMap((block) => block.pages),
  );
  const findPageForQuery = (queryId: number) =>
    allPages.find((page) => page.query_ids.includes(queryId));

  let resolvedPageId: TestSelectedPageId;
  if (selectedPageId !== undefined) {
    resolvedPageId = selectedPageId;
  } else if (selectedQueryId != null) {
    const owningPage = findPageForQuery(selectedQueryId);
    resolvedPageId = owningPage ? String(owningPage.id) : null;
  } else if (queries.length > 0) {
    const firstPage = findPageForQuery(queries[0].id);
    resolvedPageId = firstPage ? String(firstPage.id) : null;
  } else {
    resolvedPageId = null;
  }

  const getSelectedPageUrl = (pageId: string) =>
    `${Urls.exploration(exploration.id)}/page/${encodeURIComponent(pageId)}`;

  const explorationPath = Urls.exploration(exploration.id);
  const {
    explorationSidebarTabsInfo,
    selectedSidebarTab,
    getSelectedSidebarTabUrl,
    treeItemFilter,
  } = getSidebarTestContext(exploration, tab);

  const displayTree = getExplorationSidebarTree(
    exploration,
    showHidden
      ? treeItemFilter
      : (node) => treeItemFilter(node) && !isHiddenTreeItem(node),
    sortOrder,
    { keepEmptyInitialThread: tab === "all" },
  );

  const sidebar = (
    <ExplorationSidebar
      exploration={exploration}
      explorationSidebarTabsInfo={explorationSidebarTabsInfo}
      selectedSidebarTab={selectedSidebarTab}
      getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
      tree={displayTree}
      selectedPageId={resolvedPageId}
      setSelectedPageId={setSelectedPageId}
      getSelectedPageUrl={getSelectedPageUrl}
      shouldScrollSelectionRef={{ current: true }}
      isOpen
      readPageIds={readPageIds}
      showHidden={showHidden}
      onToggleShowHidden={onToggleShowHidden}
      sortOrder={sortOrder}
      onChangeSortOrder={onChangeSortOrder}
    />
  );

  renderWithProviders(<Route path={explorationPath} element={sidebar} />, {
    withRouter: true,
    initialRoute: explorationPath,
  });
  return {
    setSelectedPageId,
    onToggleShowHidden,
    onChangeSortOrder,
    getSelectedPageUrl,
    exploration,
  };
}

const pendingQuery = createQuery({
  id: 1,
  name: "Revenue by plan",
  status: "pending",
});
const doneQuery = createQuery({
  id: 2,
  name: "Revenue by region",
  status: "done",
});
const errorQuery = createQuery({
  id: 3,
  name: "Revenue by source",
  status: "error",
  error_message: "Database timed out",
});

function getRow(name: string): HTMLElement {
  // Unjustified type cast. FIXME
  return screen
    .getAllByRole("treeitem")
    .find((el) =>
      within(el).queryByText(name, { exact: false }),
    ) as HTMLElement;
}

describe("ExplorationSidebar", () => {
  it("marks pending queries as busy (shimmering text, no spinner)", () => {
    setup({ queries: [pendingQuery] });

    const row = getRow("Revenue by plan");
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(within(row).queryByLabelText("Loading…")).not.toBeInTheDocument();
  });

  it("shows a chart icon for done queries", () => {
    setup({ queries: [doneQuery] });

    expect(
      within(getRow("Revenue by region")).getByLabelText("Ready"),
    ).toBeInTheDocument();
  });

  it("shows a red error marker for error queries", async () => {
    setup({ queries: [errorQuery] });

    const row = getRow("Revenue by source");
    const marker = within(row).getByTestId("exploration-error-marker");
    expect(marker).toBeInTheDocument();
  });

  describe("unread pages", () => {
    it("bolds unread pages and keeps read pages at normal weight", () => {
      // Default pages take their query's id, so doneQuery's page is "2".
      setup({
        queries: [doneQuery, errorQuery],
        readPageIds: new Set(["2"]),
      });

      expect(
        within(getRow("Revenue by region")).getByText("Revenue by region"),
      ).toHaveStyle({ fontWeight: 500 });
      expect(
        within(getRow("Revenue by source")).getByText("Revenue by source"),
      ).toHaveStyle({ fontWeight: 700 });
    });

    it("updates rows in place when readPageIds changes instead of remounting them", async () => {
      // The tree's row component is used as a JSX element type, so if its
      // identity changed with readPageIds (as with a useCallback-defined
      // component), React would tear down and rebuild every row's DOM here.
      const exploration = createExploration({ queries: [doneQuery] });
      const {
        path,
        explorationSidebarTabsInfo,
        selectedSidebarTab,
        getSelectedSidebarTabUrl,
        getTree,
      } = getSidebarTestContext(exploration);
      const tree = getTree();

      function Harness() {
        const [readPageIds, setReadPageIds] = useState<ReadonlySet<string>>(
          new Set(),
        );
        return (
          <>
            <button onClick={() => setReadPageIds(new Set(["2"]))}>
              mark read
            </button>
            <ExplorationSidebar
              exploration={exploration}
              explorationSidebarTabsInfo={explorationSidebarTabsInfo}
              selectedSidebarTab={selectedSidebarTab}
              getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
              tree={tree}
              selectedPageId="2"
              setSelectedPageId={jest.fn()}
              getSelectedPageUrl={(pageId) => `${path}/page/${pageId}`}
              shouldScrollSelectionRef={{ current: false }}
              isOpen
              readPageIds={readPageIds}
              showHidden={false}
              onToggleShowHidden={jest.fn()}
              sortOrder={DEFAULT_SORT_ORDER}
              onChangeSortOrder={jest.fn()}
            />
          </>
        );
      }

      renderWithProviders(<Route path={path} element={<Harness />} />, {
        withRouter: true,
        initialRoute: path,
      });

      const row = getRow("Revenue by region");
      expect(within(row).getByText("Revenue by region")).toHaveStyle({
        fontWeight: 700,
      });

      await userEvent.click(screen.getByText("mark read"));

      expect(getRow("Revenue by region")).toBe(row);
      expect(within(row).getByText("Revenue by region")).toHaveStyle({
        fontWeight: 500,
      });
    });
  });

  describe("filter menu", () => {
    const filterButton = () =>
      screen.getByTestId("exploration-show-hidden-toggle");

    it("is inactive when nothing is filtered or resorted", () => {
      setup({ queries: [doneQuery] });
      expect(filterButton()).toHaveAttribute("aria-pressed", "false");
    });

    it("is active when hidden pages are shown", () => {
      setup({ queries: [doneQuery], showHidden: true });
      expect(filterButton()).toHaveAttribute("aria-pressed", "true");
    });

    it("stays inactive when a non-default sort order is set — sorting is not a filter", async () => {
      setup({ queries: [doneQuery], sortOrder: "alphabetical" });
      expect(filterButton()).toHaveAttribute("aria-pressed", "false");
      // the sort choice is still reflected inside the menu itself
      await userEvent.click(filterButton());
      expect(
        await screen.findByRole("menuitem", { name: /Alphabetical/ }),
      ).toHaveAttribute("data-checked", "true");
      expect(
        screen.getByRole("menuitem", { name: /Interestingness/ }),
      ).not.toHaveAttribute("data-checked");
    });

    it("toggles show-hidden from the menu without changing selection", async () => {
      const { onToggleShowHidden, setSelectedPageId } = setup({
        queries: [doneQuery],
      });
      await userEvent.click(filterButton());
      await userEvent.click(
        await screen.findByTestId("exploration-show-hidden-item"),
      );
      expect(onToggleShowHidden).toHaveBeenCalledTimes(1);
      // toggling the filter must not navigate/select anything
      expect(setSelectedPageId).not.toHaveBeenCalled();
    });

    it("changes sort order from the menu", async () => {
      const { onChangeSortOrder } = setup({ queries: [doneQuery] });
      await userEvent.click(filterButton());
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Alphabetical/ }),
      );
      expect(onChangeSortOrder).toHaveBeenCalledWith("alphabetical");
    });
  });

  describe("group hide menu item", () => {
    const revenueBlock = createBlock({
      id: 50,
      name: "Revenue",
      pages: [createPage({ id: 700, name: "Revenue by plan", query_ids: [7] })],
    });
    const revenueQuery = createQuery({
      id: 7,
      name: "Revenue by plan",
      status: "done",
    });

    async function openGroupMenu(groupName: RegExp) {
      const heading = screen.getByRole("group", { name: groupName });
      await userEvent.click(
        within(heading).getByRole("button", { name: "Group actions" }),
      );
    }

    it("hides the whole group's pages from the group menu", async () => {
      fetchMock.put("path:/api/exploration/pages/hidden", 204);
      setup({ queries: [revenueQuery], blocks: [revenueBlock] });

      await openGroupMenu(/Revenue/);
      await userEvent.click(screen.getByRole("menuitem", { name: /Hide/ }));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          "path:/api/exploration/pages/hidden",
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          page_ids: [700],
          hidden: true,
        });
      });
    });

    it("does not offer Hide for the first thread group", async () => {
      setup({ queries: [revenueQuery], blocks: [revenueBlock] });

      // the first thread ("Initial investigation") is not hideable...
      await openGroupMenu(/Initial investigation/);
      expect(
        screen.queryByRole("menuitem", { name: /Hide/ }),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      // ...but metric sub-groups are
      await openGroupMenu(/Revenue/);
      expect(
        screen.getByRole("menuitem", { name: /Hide/ }),
      ).toBeInTheDocument();
    });

    it("becomes a Show item that reveals the group when every page is hidden", async () => {
      fetchMock.put("path:/api/exploration/pages/hidden", 204);
      const costsQuery = createQuery({
        id: 8,
        name: "Hidden chart",
        status: "done",
      });
      setup({
        queries: [costsQuery],
        blocks: [
          createBlock({
            id: 60,
            name: "Costs",
            pages: [
              createPage({
                id: 800,
                name: "Hidden chart",
                query_ids: [8],
                hidden: true,
              }),
            ],
          }),
        ],
        showHidden: true,
      });

      // a fully-hidden group offers "Show", not "Hide"
      await openGroupMenu(/Costs/);
      expect(
        screen.queryByRole("menuitem", { name: /Hide/ }),
      ).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("menuitem", { name: /Show/ }));

      await waitFor(() => {
        const calls = fetchMock.callHistory.calls(
          "path:/api/exploration/pages/hidden",
          { method: "PUT" },
        );
        expect(calls).toHaveLength(1);
        // Unjustified type cast. FIXME
        expect(JSON.parse(calls[0].options?.body as string)).toEqual({
          page_ids: [800],
          hidden: false,
        });
      });
    });
  });

  describe("hidden page indicator", () => {
    const mixedBlock = createBlock({
      id: 70,
      name: "Costs",
      pages: [
        createPage({
          id: 750,
          name: "Hidden chart",
          query_ids: [15],
          hidden: true,
        }),
        createPage({ id: 751, name: "Visible chart", query_ids: [16] }),
      ],
    });
    const mixedQueries = [
      createQuery({ id: 15, name: "Hidden chart", status: "done" }),
      createQuery({ id: 16, name: "Visible chart", status: "done" }),
    ];

    it("marks hidden pages with a crossed-eye icon when the filter shows them", async () => {
      setup({
        queries: mixedQueries,
        blocks: [mixedBlock],
        showHidden: true,
        selectedPageId: "750",
      });

      const indicator = within(getRow("Hidden chart")).getByLabelText("Hidden");
      expect(indicator).toBeInTheDocument();
      expect(
        within(getRow("Visible chart")).queryByLabelText("Hidden"),
      ).not.toBeInTheDocument();

      await userEvent.hover(indicator);
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Hidden");
    });
  });

  describe("all-hidden empty state", () => {
    const hiddenBlock = createBlock({
      id: 1,
      name: "Revenue",
      pages: [
        createPage({
          id: 900,
          name: "Hidden chart",
          query_ids: [9],
          hidden: true,
        }),
      ],
    });
    const hiddenQuery = createQuery({
      id: 9,
      name: "Hidden chart",
      status: "done",
    });

    it("keeps the first thread with an all-hidden note when every page is hidden", () => {
      setup({ queries: [hiddenQuery], blocks: [hiddenBlock] });

      // The initial thread heading is retained, with an inline note below it.
      expect(screen.getByText("Initial investigation")).toBeInTheDocument();
      expect(
        screen.getByText("All items have been hidden."),
      ).toBeInTheDocument();
      // The childless heading renders expanded so the note reads as its content.
      expect(
        screen.getByRole("group", { name: /Initial investigation/ }),
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("shows the all-hidden note (not the generic message) when there is nothing to show", () => {
      setup({ queries: [] });

      // The thread anchor is kept on the "All" tab; whenever it has no
      // visible children the inline note shows in place of its rows.
      expect(screen.getByText("Initial investigation")).toBeInTheDocument();
      expect(
        screen.getByText("All items have been hidden."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Nothing to see here yet."),
      ).not.toBeInTheDocument();
    });

    it("renders the hidden pages instead of the note when the filter is on", () => {
      setup({
        queries: [hiddenQuery],
        blocks: [hiddenBlock],
        showHidden: true,
      });

      expect(
        screen.queryByText("All items have been hidden."),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Hidden chart")).toBeInTheDocument();
    });

    it("shows the per-tab empty message on Stars when nothing is starred", () => {
      setup({ queries: [doneQuery], tab: "stars" });

      expect(
        screen.getByText("Nothing's been starred yet."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Initial investigation"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("All items have been hidden."),
      ).not.toBeInTheDocument();
    });

    it("shows the per-tab empty message on Discussions when nothing is discussed", () => {
      setup({ queries: [doneQuery], tab: "discussions" });

      expect(screen.getByText("No discussions yet.")).toBeInTheDocument();
      expect(
        screen.queryByText("Initial investigation"),
      ).not.toBeInTheDocument();
    });

    it("shows the per-tab empty message on Stars even when the starred pages are merely hidden", () => {
      setup({
        queries: [hiddenQuery],
        blocks: [
          createBlock({
            id: 1,
            name: "Revenue",
            pages: [
              createPage({
                id: 900,
                name: "Hidden chart",
                query_ids: [9],
                hidden: true,
                starred: true,
              }),
            ],
          }),
        ],
        tab: "stars",
      });

      // Filtered tabs never show the all-hidden note — an empty tree always
      // falls through to the tab's own empty message.
      expect(
        screen.getByText("Nothing's been starred yet."),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("All items have been hidden."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Initial investigation"),
      ).not.toBeInTheDocument();
    });
  });

  it("keeps a manually collapsed heading collapsed when the tree reloads", async () => {
    fetchMock.get("express:/api/exploration/query/:id", {
      data: { rows: [], cols: [] },
    });

    const REVENUE_BLOCK_ID = 100;
    const REVENUE_PAGE_ID = 101;
    const makeBlocks = () => [
      createBlock({
        id: REVENUE_BLOCK_ID,
        name: "Revenue",
        position: 0,
        pages: [
          createPage({
            id: REVENUE_PAGE_ID,
            name: "Revenue by plan",
            position: 0,
            query_ids: [1],
          }),
        ],
      }),
    ];

    const exploration = createExploration({
      blocks: makeBlocks(),
      queries: [
        createQuery({ id: 1, name: "Revenue by plan", status: "pending" }),
      ],
    });
    const {
      explorationSidebarTabsInfo,
      selectedSidebarTab,
      getSelectedSidebarTabUrl,
      treeItemFilter,
      getTree,
    } = getSidebarTestContext(exploration);
    // A later poll: same block/page ids, but the query settled — a deep-different
    // tree, so `useTree`'s data-change effect runs.
    const reloadedTree = getExplorationSidebarTree(
      createExploration({
        blocks: makeBlocks(),
        queries: [
          createQuery({
            id: 1,
            name: "Revenue by plan",
            status: "done",
            interestingness_score: 0.9,
          }),
        ],
      }),
      treeItemFilter,
    );

    const path = Urls.exploration(exploration.id);
    const shouldScrollSelectionRef = { current: true };
    const sidebarWith = (
      tree: ReturnType<typeof getExplorationSidebarTree>,
    ) => (
      <ExplorationSidebar
        exploration={exploration}
        explorationSidebarTabsInfo={explorationSidebarTabsInfo}
        selectedSidebarTab={selectedSidebarTab}
        getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
        tree={tree}
        selectedPageId={String(REVENUE_PAGE_ID)}
        setSelectedPageId={jest.fn()}
        getSelectedPageUrl={() => path}
        shouldScrollSelectionRef={shouldScrollSelectionRef}
        isOpen
        readPageIds={new Set<string>()}
        showHidden={false}
        onToggleShowHidden={jest.fn()}
        sortOrder={DEFAULT_SORT_ORDER}
        onChangeSortOrder={jest.fn()}
      />
    );

    const { rerender } = renderWithProviders(
      <Route path={path} element={sidebarWith(getTree())} />,
      { withRouter: true, initialRoute: path },
    );

    const heading = screen.getByRole("group", { name: /Revenue/ });
    expect(heading).toHaveAttribute("aria-expanded", "true");

    // User collapses the heading.
    await userEvent.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");

    // Poll delivers a new (deep-different) tree — the collapse must be respected.
    rerender(<Route path={path} element={sidebarWith(reloadedTree)} />);
    expect(screen.getByRole("group", { name: /Revenue/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  describe("auto-expand freeze after a manual toggle", () => {
    const A_BLOCK_ID = 10;
    const B_BLOCK_ID = 20;
    const A_PAGE_ID = 1;
    const B_PAGE_ID = 2;
    const A_LEAF = String(A_PAGE_ID);
    const B_LEAF = String(B_PAGE_ID);

    function twoBlocks() {
      return [
        createBlock({
          id: A_BLOCK_ID,
          name: "Group A",
          position: 0,
          pages: [
            createPage({
              id: A_PAGE_ID,
              name: "A leaf",
              position: 0,
              query_ids: [1],
            }),
          ],
        }),
        createBlock({
          id: B_BLOCK_ID,
          name: "Group B",
          position: 1,
          pages: [
            createPage({
              id: B_PAGE_ID,
              name: "B leaf",
              position: 0,
              query_ids: [2],
            }),
          ],
        }),
      ];
    }

    function renderWithTree(
      exploration: ReturnType<typeof createExploration>,
      initialSelectedId: string,
    ) {
      const {
        path,
        explorationSidebarTabsInfo,
        selectedSidebarTab,
        getSelectedSidebarTabUrl,
        getTree,
      } = getSidebarTestContext(exploration);
      const shouldScrollSelectionRef = { current: true };
      const sidebarWith = (
        tree: ReturnType<typeof getExplorationSidebarTree>,
        selectedId: string,
      ) => (
        <ExplorationSidebar
          exploration={exploration}
          explorationSidebarTabsInfo={explorationSidebarTabsInfo}
          selectedSidebarTab={selectedSidebarTab}
          getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
          tree={tree}
          selectedPageId={selectedId}
          setSelectedPageId={jest.fn()}
          getSelectedPageUrl={() => path}
          shouldScrollSelectionRef={shouldScrollSelectionRef}
          isOpen
          readPageIds={new Set<string>()}
          showHidden={false}
          onToggleShowHidden={jest.fn()}
          sortOrder={DEFAULT_SORT_ORDER}
          onChangeSortOrder={jest.fn()}
        />
      );
      const { rerender } = renderWithProviders(
        <Route
          path={path}
          element={sidebarWith(getTree(), initialSelectedId)}
        />,
        { withRouter: true, initialRoute: path },
      );
      return {
        rerenderWith: (
          tree: ReturnType<typeof getExplorationSidebarTree>,
          selectedId: string,
        ) =>
          rerender(
            <Route path={path} element={sidebarWith(tree, selectedId)} />,
          ),
      };
    }

    it("does not auto-expand a newly auto-selected page after the user collapsed one", async () => {
      fetchMock.get("express:/api/exploration/query/:id", {
        data: { rows: [], cols: [] },
      });

      const exploration = createExploration({
        blocks: twoBlocks(),
        queries: [
          createQuery({ id: 1, name: "A leaf", status: "done" }),
          createQuery({ id: 2, name: "B leaf", status: "pending" }),
        ],
      });
      const { treeItemFilter } = getSidebarTestContext(exploration);
      // A later poll: B's query settles with high interestingness (deep-different
      // tree), so the auto-selection moves to Group B's page.
      const reloadedTree = getExplorationSidebarTree(
        createExploration({
          blocks: twoBlocks(),
          queries: [
            createQuery({ id: 1, name: "A leaf", status: "done" }),
            createQuery({
              id: 2,
              name: "B leaf",
              status: "done",
              interestingness_score: 0.9,
            }),
          ],
        }),
        treeItemFilter,
      );

      const { rerenderWith } = renderWithTree(exploration, A_LEAF);

      const groupA = screen.getByRole("group", { name: /Group A/ });
      expect(groupA).toHaveAttribute("aria-expanded", "true");
      await userEvent.click(groupA);
      expect(groupA).toHaveAttribute("aria-expanded", "false");

      rerenderWith(reloadedTree, B_LEAF);

      // Frozen: the collapsed group stays collapsed and the newly auto-selected
      // group is NOT auto-expanded.
      expect(screen.getByRole("group", { name: /Group A/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(screen.getByRole("group", { name: /Group B/ })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });

    it("arrow-key navigation still reveals the target group after a manual toggle", async () => {
      fetchMock.get("express:/api/exploration/query/:id", {
        data: { rows: [], cols: [] },
      });

      const exploration = createExploration({
        blocks: twoBlocks(),
        queries: [
          createQuery({ id: 1, name: "A leaf", status: "done" }),
          createQuery({ id: 2, name: "B leaf", status: "done" }),
        ],
      });

      renderWithTree(exploration, A_LEAF);

      // User collapses Group A → freezes automatic expansion.
      await userEvent.click(screen.getByRole("group", { name: /Group A/ }));

      // Explicit keyboard navigation into Group B still reveals it.
      fireEvent.keyDown(document.body, { key: "ArrowRight" });
      expect(screen.getByRole("group", { name: /Group B/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
  });

  describe("heading last-activity label", () => {
    it("shows the compact time since the newest query run on the thread heading", () => {
      setup({
        queries: [
          createQuery({
            id: 1,
            name: "Revenue by plan",
            status: "done",
            finished_at: dayjs().subtract(2, "day").toISOString(),
          }),
        ],
        blocks: [
          createBlock({
            id: 100,
            name: "Revenue",
            position: 0,
            pages: [
              createPage({
                id: 1,
                name: "Revenue by plan",
                position: 0,
                query_ids: [1],
              }),
            ],
          }),
        ],
      });

      const heading = screen.getByRole("group", {
        name: /Initial investigation/,
      });
      expect(within(heading).getByText("2d")).toBeInTheDocument();
    });
  });

  describe("heading status inherited from descendant queries", () => {
    const HEADING_BLOCK_ID = 100;
    const headingBlocks = [
      createBlock({
        id: HEADING_BLOCK_ID,
        name: "Revenue",
        position: 0,
        pages: [
          createPage({ id: 1, name: "Leaf A", position: 0, query_ids: [1] }),
          createPage({ id: 2, name: "Leaf B", position: 1, query_ids: [2] }),
        ],
      }),
    ];
    const headingRow = () => screen.getByRole("group", { name: /Revenue/ });

    it("marks the heading as busy while any descendant query is still loading", () => {
      setup({
        queries: [
          createQuery({ id: 1, name: "Leaf A", status: "pending" }),
          createQuery({ id: 2, name: "Leaf B", status: "done" }),
        ],
        blocks: headingBlocks,
        selectedPageId: "2",
      });

      expect(headingRow()).toHaveAttribute("aria-busy", "true");
    });

    it("shows no status icon when settled with an errored child (loading-only)", () => {
      setup({
        queries: [
          createQuery({ id: 1, name: "Leaf A", status: "done" }),
          createQuery({
            id: 2,
            name: "Leaf B",
            status: "error",
            error_message: "boom",
          }),
        ],
        blocks: headingBlocks,
        selectedPageId: "1",
      });

      // The heading never surfaces an error icon, and a settled child isn't busy.
      expect(headingRow()).toHaveAttribute("aria-busy", "false");
    });

    it("shows no status icon when all descendant queries are done", () => {
      setup({
        queries: [
          createQuery({ id: 1, name: "Leaf A", status: "done" }),
          createQuery({ id: 2, name: "Leaf B", status: "done" }),
        ],
        blocks: headingBlocks,
        selectedPageId: "1",
      });

      const row = headingRow();
      expect(row).toHaveAttribute("aria-busy", "false");
      expect(
        within(row).queryByLabelText("Failed to generate"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a stopped icon for canceled queries", () => {
    setup({
      queries: [
        createQuery({
          id: 4,
          name: "Revenue by channel",
          status: "canceled",
        }),
      ],
    });

    expect(
      within(getRow("Revenue by channel")).getByLabelText("Stopped"),
    ).toBeInTheDocument();
  });

  it("links each row to the selected entity URL", () => {
    const { getSelectedPageUrl } = setup({
      queries: [pendingQuery, doneQuery],
    });

    expect(getRow("Revenue by region")).toHaveAttribute(
      "href",
      getSelectedPageUrl(String(doneQuery.id)),
    );
  });

  it("marks the selected query row as selected", () => {
    setup({
      queries: [pendingQuery, doneQuery],
      selectedQueryId: doneQuery.id,
    });

    expect(getRow("Revenue by region")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(getRow("Revenue by plan")).toHaveAttribute("aria-selected", "false");
  });

  describe("thread menu", () => {
    // A canceled thread is stamped with both timestamps by the cancel endpoint.
    const canceledThread = {
      id: 1,
      status: "canceled" as const,
      canceled_at: "2026-04-30T00:01:00Z",
      completed_at: "2026-04-30T00:01:00Z",
    };

    const findThreadMenuButton = () =>
      screen
        .getAllByRole("group", { name: /Initial investigation/ })
        .find((el) =>
          within(el)
            .queryAllByRole("button")
            .some((btn) => !btn.getAttribute("aria-label")?.startsWith("Hide")),
        );

    it("calls cancel when Stop running is clicked on a running thread", async () => {
      fetchMock.post("path:/api/exploration/thread/1/cancel", {
        id: 1,
        canceled_at: "2026-04-30T00:01:00Z",
        completed_at: null,
      });

      setup({ queries: [pendingQuery] });

      const threadHeading = findThreadMenuButton();
      expect(threadHeading).toBeDefined();

      await userEvent.click(within(threadHeading!).getByRole("button"));
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Stop running/ }),
      );

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(
            "path:/api/exploration/thread/1/cancel",
            {
              method: "POST",
            },
          ),
        ).toBe(true);
      });
    });

    it("does not offer Stop running when the thread is already canceled", async () => {
      setup({ queries: [pendingQuery], thread: canceledThread });

      const threadHeading = findThreadMenuButton();
      expect(threadHeading).toBeDefined();

      await userEvent.click(within(threadHeading!).getByRole("button"));

      expect(
        screen.queryByRole("menuitem", { name: /Stop running/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Restart/ }),
      ).toBeInTheDocument();
    });

    it("does not offer Stop running when the user lacks write access", async () => {
      setup({ queries: [pendingQuery], canWrite: false });

      const threadHeading = findThreadMenuButton();
      await userEvent.click(within(threadHeading!).getByRole("button"));

      expect(
        screen.queryByRole("menuitem", { name: /Stop running/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Copy link/ }),
      ).toBeInTheDocument();
    });

    it("calls restart on the thread whose menu was opened", async () => {
      const restartPath = `path:/api/exploration/thread/${canceledThread.id}/restart`;
      fetchMock.post(restartPath, {
        ...createExploration({ queries: [pendingQuery] }),
      });

      setup({ queries: [pendingQuery], thread: canceledThread });

      const threadHeading = findThreadMenuButton();
      expect(threadHeading).toBeDefined();

      await userEvent.click(within(threadHeading!).getByRole("button"));
      await userEvent.click(screen.getByRole("menuitem", { name: /Restart/ }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called(restartPath, { method: "POST" }),
        ).toBe(true);
      });
    });

    it("does not offer Restart when the thread completed successfully", async () => {
      setup({
        queries: [pendingQuery],
        thread: { status: "completed", completed_at: "2026-04-30T00:01:00Z" },
      });

      // Neither Stop (terminal) nor Restart (a successful run has nothing to re-run) — only Copy link.
      const threadHeading = findThreadMenuButton();
      await userEvent.click(within(threadHeading!).getByRole("button"));

      expect(
        screen.queryByRole("menuitem", { name: /Stop running/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Restart/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Copy link/ }),
      ).toBeInTheDocument();
    });

    it("offers Restart (and no Stop) on a terminally-failed thread", async () => {
      setup({
        queries: [pendingQuery],
        thread: { status: "failed", completed_at: "2026-04-30T00:01:00Z" },
      });

      const threadHeading = findThreadMenuButton();
      await userEvent.click(within(threadHeading!).getByRole("button"));

      expect(
        screen.queryByRole("menuitem", { name: /Stop running/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("menuitem", { name: /Restart/ }),
      ).toBeInTheDocument();
    });

    it("does not offer Restart when the user lacks write access", async () => {
      setup({
        queries: [pendingQuery],
        thread: canceledThread,
        canWrite: false,
      });

      const threadHeading = findThreadMenuButton();
      await userEvent.click(within(threadHeading!).getByRole("button"));

      expect(
        screen.queryByRole("menuitem", { name: /Restart/ }),
      ).not.toBeInTheDocument();
    });

    it("copies a link to the group's first page from the menu", async () => {
      const { getSelectedPageUrl } = setup({ queries: [doneQuery] });

      const threadHeading = findThreadMenuButton();
      await userEvent.click(within(threadHeading!).getByRole("button"));
      await userEvent.click(
        screen.getByRole("menuitem", { name: /Copy link/ }),
      );

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}${getSelectedPageUrl(String(doneQuery.id))}`,
      );
    });
  });

  describe("query blocks", () => {
    // Each metric block + pages.
    const planQueries: ExplorationQuery[] = [
      createQuery({
        id: 11,
        name: "Revenue by plan (all)",
        status: "done",
      }),
      createQuery({
        id: 12,
        name: "Revenue by plan (US)",
        status: "done",
      }),
    ];
    const regionQueries: ExplorationQuery[] = [
      createQuery({
        id: 21,
        name: "Revenue by region (all)",
        status: "done",
      }),
      createQuery({
        id: 22,
        name: "Revenue by region (EU)",
        status: "done",
      }),
    ];

    const PLAN_BLOCK_ID = 10;
    const REGION_BLOCK_ID = 20;
    const planLeafAllId = String(planQueries[0].id);
    const planLeafUsId = String(planQueries[1].id);
    const regionLeafAllId = String(regionQueries[0].id);

    // Two top-level metric blocks, each containing two single-query pages.
    const blocks: ExplorationBlockNode[] = [
      createBlock({
        id: PLAN_BLOCK_ID,
        name: "Revenue by plan",
        position: 0,
        pages: [
          createPage({
            id: planQueries[0].id,
            name: planQueries[0].name,
            position: 0,
            query_ids: [planQueries[0].id],
          }),
          createPage({
            id: planQueries[1].id,
            name: planQueries[1].name,
            position: 1,
            query_ids: [planQueries[1].id],
          }),
        ],
      }),
      createBlock({
        id: REGION_BLOCK_ID,
        name: "Revenue by region",
        position: 1,
        pages: [
          createPage({
            id: regionQueries[0].id,
            name: regionQueries[0].name,
            position: 0,
            query_ids: [regionQueries[0].id],
          }),
          createPage({
            id: regionQueries[1].id,
            name: regionQueries[1].name,
            position: 1,
            query_ids: [regionQueries[1].id],
          }),
        ],
      }),
    ];

    it("renders one collapsible heading per metric and toggles its page rows when clicked", async () => {
      setup({
        queries: [...planQueries, ...regionQueries],
        blocks,
        selectedPageId: planLeafAllId,
      });

      const planHeading = screen.getByRole("group", {
        name: /Revenue by plan/,
      });
      const regionHeading = screen.getByRole("group", {
        name: /Revenue by region/,
      });
      expect(planHeading).toHaveAttribute("aria-expanded", "true");
      expect(regionHeading).toHaveAttribute("aria-expanded", "false");

      // Plan pages are in the DOM; region pages aren't until that
      // heading is opened.
      expect(getRow("Revenue by plan (all)")).toBeInTheDocument();
      expect(
        screen.queryByText("Revenue by region (all)", { exact: false }),
      ).not.toBeInTheDocument();

      // Click the region heading → expands and reveals its pages.
      await userEvent.click(regionHeading);
      expect(regionHeading).toHaveAttribute("aria-expanded", "true");
      expect(getRow("Revenue by region (all)")).toBeInTheDocument();
      expect(getRow("Revenue by region (EU)")).toBeInTheDocument();

      // Toggle the plan heading off — its pages disappear; the
      // region heading stays expanded.
      await userEvent.click(planHeading);
      expect(planHeading).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByText("Revenue by plan (all)", { exact: false }),
      ).not.toBeInTheDocument();
      expect(regionHeading).toHaveAttribute("aria-expanded", "true");
    });

    it("a heading wrapping a single page is collapsible — collapsing it removes the page from the DOM", async () => {
      const onlyQuery = createQuery({
        id: 99,
        name: "Solo dimension",
        status: "done",
      });
      const SOLO_BLOCK_ID = 30;
      const SOLO_PAGE_ID = 300;
      setup({
        queries: [onlyQuery],
        blocks: [
          createBlock({
            id: SOLO_BLOCK_ID,
            name: "Solo metric",
            position: 0,
            pages: [
              createPage({
                id: SOLO_PAGE_ID,
                name: onlyQuery.name,
                position: 0,
                query_ids: [onlyQuery.id],
              }),
            ],
          }),
        ],
        // Anchor selection on the page so the thread + metric
        // headings start auto-expanded.
        selectedPageId: String(SOLO_PAGE_ID),
      });

      const heading = screen.getByRole("group", { name: /Solo metric/ });
      expect(heading).toHaveAttribute("aria-expanded", "true");
      expect(getRow("Solo dimension")).toBeInTheDocument();

      // Collapsing the heading removes the lone page from the DOM.
      await userEvent.click(heading);
      expect(heading).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByText("Solo dimension", { exact: false }),
      ).not.toBeInTheDocument();
    });

    it("each page row's status icon reflects its own queries; the heading shows the rolled-up status", () => {
      // One heading with three pages: one running, one errored, one done.
      // Each page shows its own status; the heading inherits the rolled-up
      // status of all its descendant queries (running here, since one is still
      // loading).
      const runningPageQueries = [
        createQuery({ id: 1001, name: "Pending leaf q1", status: "pending" }),
        createQuery({ id: 1002, name: "Pending leaf q2", status: "done" }),
      ];
      const errorPageQueries = [
        createQuery({ id: 2001, name: "Error leaf q1", status: "done" }),
        createQuery({
          id: 2002,
          name: "Error leaf q2",
          status: "error",
          error_message: "boom",
        }),
      ];
      const donePageQueries = [
        createQuery({ id: 3001, name: "Done leaf q1", status: "done" }),
        createQuery({ id: 3002, name: "Done leaf q2", status: "done" }),
      ];

      const STATUS_BLOCK_ID = 40;
      const RUNNING_PAGE_ID = 401;
      setup({
        queries: [
          ...runningPageQueries,
          ...errorPageQueries,
          ...donePageQueries,
        ],
        blocks: [
          createBlock({
            id: STATUS_BLOCK_ID,
            name: "Status metric",
            position: 0,
            pages: [
              createPage({
                id: RUNNING_PAGE_ID,
                name: "Still running",
                position: 0,
                query_ids: runningPageQueries.map((q) => q.id),
              }),
              createPage({
                id: 402,
                name: "Has an error",
                position: 1,
                query_ids: errorPageQueries.map((q) => q.id),
              }),
              createPage({
                id: 403,
                name: "All settled",
                position: 2,
                query_ids: donePageQueries.map((q) => q.id),
              }),
            ],
          }),
        ],
        // Select the first page so the heading auto-expands and all
        // three pages are in the DOM.
        selectedPageId: String(RUNNING_PAGE_ID),
      });

      // Page rows are labelled by the BE-provided page name; each row's status
      // is derived from that page's own queries.
      expect(getRow("Still running")).toHaveAttribute("aria-busy", "true");
      expect(
        within(getRow("Has an error")).getByLabelText("Failed to generate"),
      ).toBeInTheDocument();
      expect(
        within(getRow("All settled")).getByLabelText("Ready"),
      ).toBeInTheDocument();

      // Heading inherits the rolled-up status: one descendant query is still
      // loading, so it reads as busy (never the page "Ready" icon).
      const heading = screen.getByRole("group", { name: /Status metric/ });
      expect(heading).toHaveAttribute("aria-busy", "true");
      expect(within(heading).queryByLabelText("Ready")).not.toBeInTheDocument();
    });

    it("sorts zero-row pages to the bottom and shows them as errors", () => {
      const done = createQuery({
        id: 1,
        name: "Done",
        status: "done",
      });
      const running = createQuery({
        id: 2,
        name: "Running",
        status: "pending",
      });
      const empty = createQuery({
        id: 3,
        name: "Empty",
        status: "done",
        row_count: 0,
      });

      const SORT_BLOCK_ID = 50;
      setup({
        queries: [empty, running, done],
        blocks: [
          createBlock({
            id: SORT_BLOCK_ID,
            name: "Sort metric",
            position: 0,
            pages: [
              createPage({
                id: 3,
                name: "Empty",
                position: 0,
                query_ids: [empty.id],
              }),
              createPage({
                id: 2,
                name: "Running",
                position: 1,
                query_ids: [running.id],
              }),
              createPage({
                id: 1,
                name: "Done",
                position: 2,
                query_ids: [done.id],
              }),
            ],
          }),
        ],
        selectedPageId: "1",
      });

      const rows = screen.getAllByRole("treeitem");
      const rowIndex = (name: string) =>
        rows.findIndex((row) =>
          within(row).queryByText(name, { exact: false }),
        );

      expect(rowIndex("Done")).toBeLessThan(rowIndex("Running"));
      expect(rowIndex("Running")).toBeLessThan(rowIndex("Empty"));
      expect(
        within(getRow("Empty")).getByLabelText("Failed to generate"),
      ).toBeInTheDocument();
    });

    it("auto-expands the heading that owns the selected page and leaves the other heading collapsed", () => {
      setup({
        queries: [...planQueries, ...regionQueries],
        blocks,
        // Selecting a region page should bubble up the auto-expand to
        // the `Revenue by region` heading.
        selectedPageId: regionLeafAllId,
      });

      const planHeading = screen.getByRole("group", {
        name: /Revenue by plan/,
      });
      const regionHeading = screen.getByRole("group", {
        name: /Revenue by region/,
      });

      expect(regionHeading).toHaveAttribute("aria-expanded", "true");
      expect(planHeading).toHaveAttribute("aria-expanded", "false");
      expect(getRow("Revenue by region (all)")).toBeInTheDocument();
      expect(
        screen.queryByText("Revenue by plan (all)", { exact: false }),
      ).not.toBeInTheDocument();
    });

    describe("multi-query page", () => {
      const pageQueries: ExplorationQuery[] = [
        createQuery({ id: 31, name: "Revenue (US)", status: "done" }),
        createQuery({ id: 32, name: "Revenue (EU)", status: "done" }),
      ];
      const PAGE_BLOCK_ID = 50;
      const PAGE_LEAF_ID = 500;
      const pageBlocks: ExplorationBlockNode[] = [
        createBlock({
          id: PAGE_BLOCK_ID,
          name: "Page metric",
          position: 0,
          pages: [
            createPage({
              id: PAGE_LEAF_ID,
              // The page row is labelled by the BE-provided page name; the
              // constituent queries are fanned out behind the single row.
              name: "Revenue across regions",
              position: 0,
              query_ids: pageQueries.map((q) => q.id),
            }),
          ],
        }),
      ];

      it("renders a single `By <dimension>` page row that fans the queries out behind it without exposing them individually", () => {
        setup({
          queries: pageQueries,
          blocks: pageBlocks,
          selectedPageId: String(PAGE_LEAF_ID),
        });

        // One page row labelled by the page name.
        expect(getRow("Revenue across regions")).toBeInTheDocument();
        // The other constituent query name is NOT exposed as its own row.
        const allRows = screen.getAllByRole("treeitem");
        expect(
          allRows.filter((row) =>
            within(row).queryByText("Revenue (EU)", { exact: false }),
          ),
        ).toHaveLength(0);
        // Exactly one treeitem (the single page) is rendered.
        expect(allRows).toHaveLength(1);
      });

      it("links the page row to the selected page URL", () => {
        const { getSelectedPageUrl } = setup({
          queries: pageQueries,
          blocks: pageBlocks,
          selectedPageId: String(PAGE_LEAF_ID),
        });

        expect(getRow("Revenue across regions")).toHaveAttribute(
          "href",
          getSelectedPageUrl(String(PAGE_LEAF_ID)),
        );
      });

      it("marks the page row as selected when its page is the selected entity", () => {
        setup({
          queries: pageQueries,
          blocks: pageBlocks,
          selectedPageId: String(PAGE_LEAF_ID),
        });

        expect(getRow("Revenue across regions")).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      it("a mixed-status page reports the worst-case status on its single row", () => {
        const mixedPageQueries = [
          createQuery({ id: 41, name: "OK query", status: "done" }),
          createQuery({
            id: 42,
            name: "Boom query",
            status: "error",
            error_message: "kaboom",
          }),
        ];
        const MIXED_PAGE_ID = 510;
        setup({
          queries: mixedPageQueries,
          blocks: [
            createBlock({
              id: PAGE_BLOCK_ID,
              name: "Mixed metric",
              position: 0,
              pages: [
                createPage({
                  id: MIXED_PAGE_ID,
                  name: "Mixed page",
                  position: 0,
                  query_ids: mixedPageQueries.map((q) => q.id),
                }),
              ],
            }),
          ],
          selectedPageId: String(MIXED_PAGE_ID),
        });

        // The error wins — the row's icon is the warning.
        expect(
          within(getRow("Mixed page")).getByLabelText("Failed to generate"),
        ).toBeInTheDocument();
      });
    });

    describe("arrow-key navigation", () => {
      it("Right moves selection from one page to the next within the same heading and keeps that heading expanded", () => {
        const { setSelectedPageId } = setup({
          queries: [...planQueries, ...regionQueries],
          blocks,
          selectedPageId: planLeafAllId,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedPageId).toHaveBeenLastCalledWith(planLeafUsId);
        // Region heading stayed closed; we never left the plan heading.
        const regionHeading = screen.getByRole("group", {
          name: /Revenue by region/,
        });
        expect(regionHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Right past the last page in a heading selects the first page of the next heading and collapses the source heading", () => {
        const { setSelectedPageId } = setup({
          queries: [...planQueries, ...regionQueries],
          blocks,
          // Selection sits on the LAST page of the plan heading.
          selectedPageId: planLeafUsId,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedPageId).toHaveBeenLastCalledWith(regionLeafAllId);

        // The keyboard handler imperatively collapses the source
        // heading via `treeController.collapse`. Auto-expanding the
        // target heading happens via `getInitialExpandedIds` on the
        // next render — that's a parent-side effect we don't model
        // here (the `setSelectedPageId` is a mock so the controlled
        // `selectedPageId` prop never updates).
        const planHeading = screen.getByRole("group", {
          name: /Revenue by plan/,
        });
        expect(planHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Left past the first page in a heading selects the last page of the previous heading and collapses the source heading", () => {
        const { setSelectedPageId } = setup({
          queries: [...planQueries, ...regionQueries],
          blocks,
          selectedPageId: regionLeafAllId,
        });

        fireEvent.keyDown(document.body, { key: "ArrowLeft" });

        expect(setSelectedPageId).toHaveBeenLastCalledWith(planLeafUsId);

        const regionHeading = screen.getByRole("group", {
          name: /Revenue by region/,
        });
        expect(regionHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Right onto a multi-query page in a different heading still dispatches a page selection and collapses the source heading", () => {
        const pageQueriesNav = [
          createQuery({ id: 101, name: "Page q1", status: "done" }),
          createQuery({ id: 102, name: "Page q2", status: "done" }),
        ];
        const PAGE_BLOCK_ID = 60;
        const PAGE_LEAF_ID = 600;
        const { setSelectedPageId } = setup({
          queries: [...planQueries, ...pageQueriesNav],
          blocks: [
            blocks[0], // plan block + its two single-query pages
            createBlock({
              id: PAGE_BLOCK_ID,
              name: "Page after plan",
              position: 1,
              pages: [
                createPage({
                  id: PAGE_LEAF_ID,
                  name: "Page leaf",
                  position: 0,
                  query_ids: pageQueriesNav.map((q) => q.id),
                }),
              ],
            }),
          ],
          // Selection on the last plan page — Right should bridge to
          // the next heading's first (and only) page.
          selectedPageId: planLeafUsId,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedPageId).toHaveBeenLastCalledWith(
          String(PAGE_LEAF_ID),
        );
        const planHeading = screen.getByRole("group", {
          name: /Revenue by plan/,
        });
        expect(planHeading).toHaveAttribute("aria-expanded", "false");
      });
    });
  });

  describe("programmatic selection scrolling", () => {
    const BLOCK_ID = 800;
    const PAGE_ID = 801;
    const scrollIntoViewMock = jest.fn();

    beforeEach(() => {
      scrollIntoViewMock.mockClear();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        writable: true,
        value: scrollIntoViewMock,
      });
    });

    function nestedExploration() {
      return createExploration({
        blocks: [
          createBlock({
            id: BLOCK_ID,
            name: "Nested group",
            pages: [
              createPage({
                id: PAGE_ID,
                name: "Nested page",
                query_ids: [1],
              }),
            ],
          }),
        ],
        queries: [createQuery({ id: 1, name: "Nested query", status: "done" })],
      });
    }

    it("scrolls the selected page into view and clears the scroll ref", () => {
      const shouldScrollSelectionRef = { current: true };
      const exploration = nestedExploration();
      const {
        path,
        explorationSidebarTabsInfo,
        selectedSidebarTab,
        getSelectedSidebarTabUrl,
        getTree,
      } = getSidebarTestContext(exploration);

      renderWithProviders(
        <Route
          path={path}
          element={
            <ExplorationSidebar
              exploration={exploration}
              explorationSidebarTabsInfo={explorationSidebarTabsInfo}
              selectedSidebarTab={selectedSidebarTab}
              getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
              tree={getTree()}
              selectedPageId={String(PAGE_ID)}
              setSelectedPageId={jest.fn()}
              getSelectedPageUrl={() => path}
              shouldScrollSelectionRef={shouldScrollSelectionRef}
              isOpen
              readPageIds={new Set<string>()}
              showHidden={false}
              onToggleShowHidden={jest.fn()}
              sortOrder={DEFAULT_SORT_ORDER}
              onChangeSortOrder={jest.fn()}
            />
          }
        />,
        { withRouter: true, initialRoute: path },
      );

      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: "nearest" });
      expect(shouldScrollSelectionRef.current).toBe(false);
    });

    it("re-expands collapsed ancestors when programmatic navigation arms scrolling", async () => {
      const exploration = nestedExploration();
      const {
        path,
        explorationSidebarTabsInfo,
        selectedSidebarTab,
        getSelectedSidebarTabUrl,
        getTree,
      } = getSidebarTestContext(exploration);
      const shouldScrollSelectionRef = { current: false };

      // Drives the real reconcile path the app uses: a programmatic update
      // (poll refetch / arrow-key nav) arms `shouldScrollSelectionRef` and hands
      // the sidebar a fresh tree, whose effect re-reveals the selection. Using
      // in-component state rather than a router rerender keeps the sidebar
      // mounted, so this exercises the effect — not a remount.
      function Harness() {
        const [tree, setTree] = useState(() => getTree());
        return (
          <>
            <button
              onClick={() => {
                shouldScrollSelectionRef.current = true;
                setTree(getTree());
              }}
            >
              arm scroll
            </button>
            <ExplorationSidebar
              exploration={exploration}
              explorationSidebarTabsInfo={explorationSidebarTabsInfo}
              selectedSidebarTab={selectedSidebarTab}
              getSelectedSidebarTabUrl={getSelectedSidebarTabUrl}
              tree={tree}
              selectedPageId={String(PAGE_ID)}
              setSelectedPageId={jest.fn()}
              getSelectedPageUrl={() => path}
              shouldScrollSelectionRef={shouldScrollSelectionRef}
              isOpen
              readPageIds={new Set<string>()}
              showHidden={false}
              onToggleShowHidden={jest.fn()}
              sortOrder={DEFAULT_SORT_ORDER}
              onChangeSortOrder={jest.fn()}
            />
          </>
        );
      }

      renderWithProviders(<Route path={path} element={<Harness />} />, {
        withRouter: true,
        initialRoute: path,
      });

      const heading = screen.getByRole("group", { name: /Nested group/ });
      await userEvent.click(heading);
      expect(heading).toHaveAttribute("aria-expanded", "false");

      await userEvent.click(screen.getByText("arm scroll"));

      expect(
        screen.getByRole("group", { name: /Nested group/ }),
      ).toHaveAttribute("aria-expanded", "true");
    });
  });
});
