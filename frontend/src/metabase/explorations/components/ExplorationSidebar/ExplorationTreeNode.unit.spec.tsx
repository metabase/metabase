import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { DEFAULT_SORT_ORDER } from "metabase/explorations/sidebar-preferences";
import {
  createBlock,
  createExploration,
  createPage,
  createQuery,
} from "metabase/explorations/test-utils";
import { Route } from "metabase/router";
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
  pendingQuery,
  setup,
} from "./test-utils";

jest.mock("metabase/explorations/analytics");

describe("ExplorationTreeNode", () => {
  it("marks pending queries as busy (shimmering text, no spinner)", () => {
    setup({ queries: [pendingQuery] });

    const row = getRow("Revenue by plan");
    expect(row).toHaveAttribute("aria-busy", "true");
    expect(within(row).queryByLabelText("Loading…")).not.toBeInTheDocument();
  });

  it("staggers the shimmer phase per row so loading rows don't pulse in unison", () => {
    const otherPendingQuery = createQuery({
      id: 9,
      name: "Revenue by device",
      status: "pending",
    });
    setup({ queries: [pendingQuery, otherPendingQuery] });

    const delayOf = (name: string) =>
      within(getRow(name))
        .getByText(name)
        .style.getPropertyValue("--shimmer-delay");

    expect(delayOf("Revenue by plan")).toMatch(/^-\d+ms$/);
    expect(delayOf("Revenue by plan")).not.toEqual(
      delayOf("Revenue by device"),
    );
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
        within(row).queryByTestId("exploration-error-marker"),
      ).not.toBeInTheDocument();
    });
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
      queries: [...runningPageQueries, ...errorPageQueries, ...donePageQueries],
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
      within(getRow("Has an error")).getByLabelText(
        "We couldn't generate one or more of these charts.",
      ),
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
        within(getRow("Mixed page")).getByLabelText(
          "We couldn't generate one or more of these charts.",
        ),
      ).toBeInTheDocument();
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

    it("scrolls the selected page into view and clears the scroll ref", () => {
      const shouldScrollSelectionRef = { current: true };
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
  });
});
