import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { useState } from "react";

import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  within,
} from "__support__/ui";
import { trackExplorationVisualizationChanged } from "metabase/explorations/analytics";
import { DEFAULT_SORT_ORDER } from "metabase/explorations/sidebar-preferences";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import type {
  ExplorationBlockNode,
  ExplorationQuery,
} from "metabase-types/api";

import { ExplorationSidebar } from "./ExplorationSidebar";
import {
  doneQuery,
  errorQuery,
  getRow,
  getSidebarTestContext,
  setup,
} from "./test-utils";
import { getExplorationSidebarTree } from "./utils";

jest.mock("metabase/explorations/analytics");

describe("ExplorationSidebar", () => {
  describe("keyboard navigation", () => {
    it("moves selection to the next page with ArrowRight", () => {
      const { setSelectedPageId } = setup({
        queries: [doneQuery, errorQuery],
        selectedQueryId: 2,
      });

      fireEvent.keyDown(document.body, { key: "ArrowRight" });

      expect(setSelectedPageId).toHaveBeenCalledWith("3");
      expect(trackExplorationVisualizationChanged).toHaveBeenCalledWith(
        expect.any(Number),
        "keyboard",
      );
    });

    it("moves selection to the previous page with ArrowLeft", () => {
      const { setSelectedPageId } = setup({
        queries: [doneQuery, errorQuery],
        selectedQueryId: 3,
      });

      fireEvent.keyDown(document.body, { key: "ArrowLeft" });

      expect(setSelectedPageId).toHaveBeenCalledWith("2");
    });
  });

  it("collapses and re-expands a heading on click, hiding and revealing its pages", async () => {
    setup({
      queries: [doneQuery, errorQuery],
      blocks: [
        createBlock({
          id: 10,
          name: "Revenue group",
          position: 0,
          pages: [
            createPage({
              id: 2,
              name: "Revenue by region",
              position: 0,
              query_ids: [2],
            }),
            createPage({
              id: 3,
              name: "Revenue by source",
              position: 1,
              query_ids: [3],
            }),
          ],
        }),
      ],
    });

    const heading = () => screen.getByRole("group", { name: /Revenue group/ });

    expect(heading()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Revenue by region")).toBeInTheDocument();
    expect(screen.getByText("Revenue by source")).toBeInTheDocument();

    await userEvent.click(heading());
    expect(heading()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Revenue by region")).not.toBeInTheDocument();
    expect(screen.queryByText("Revenue by source")).not.toBeInTheDocument();

    await userEvent.click(heading());
    expect(heading()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Revenue by region")).toBeInTheDocument();
    expect(screen.getByText("Revenue by source")).toBeInTheDocument();
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

    it("shows the generic empty message (not the all-hidden note) when nothing is hidden yet", () => {
      // No pages at all — e.g. an exploration still generating its charts.
      // Nothing is hidden, so the empty state should show rather than the note.
      setup({ queries: [] });

      expect(screen.getByText("Nothing to see here yet.")).toBeInTheDocument();
      expect(
        screen.queryByText("All items have been hidden."),
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

    // In-component state (not a router rerender) swaps the tree while the sidebar
    // stays mounted, exercising the data-change effect instead of a remount.
    function Harness() {
      const [tree, setTree] = useState(() => getTree());
      return (
        <>
          <button onClick={() => setTree(reloadedTree)}>reload tree</button>
          {sidebarWith(tree)}
        </>
      );
    }

    renderWithProviders(<Route path={path} element={<Harness />} />, {
      withRouter: true,
      initialRoute: path,
    });

    const heading = screen.getByRole("group", { name: /Revenue/ });
    expect(heading).toHaveAttribute("aria-expanded", "true");

    // User collapses the heading.
    await userEvent.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");

    // Poll delivers a new (deep-different) tree — the collapse must be respected.
    await userEvent.click(screen.getByText("reload tree"));
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
      // Drive updates through in-component state so the sidebar stays mounted
      // (a router rerender would remount it and warn about changing routes).
      let applyUpdate: (next: {
        tree: ReturnType<typeof getExplorationSidebarTree>;
        selectedId: string;
      }) => void = () => {};
      function Harness() {
        const [state, setState] = useState(() => ({
          tree: getTree(),
          selectedId: initialSelectedId,
        }));
        applyUpdate = setState;
        return sidebarWith(state.tree, state.selectedId);
      }

      renderWithProviders(<Route path={path} element={<Harness />} />, {
        withRouter: true,
        initialRoute: path,
      });
      return {
        rerenderWith: (
          tree: ReturnType<typeof getExplorationSidebarTree>,
          selectedId: string,
        ) => act(() => applyUpdate({ tree, selectedId })),
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
        within(getRow("Empty")).getByLabelText(
          "We couldn't generate one or more of these charts.",
        ),
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

    it("re-expands collapsed ancestors when programmatic navigation arms scrolling", async () => {
      const exploration = createExploration({
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
