import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { Route } from "react-router";

import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import {
  createExploration,
  createExplorationDocument,
  createQuery,
} from "metabase/explorations/test-utils";
import * as Urls from "metabase/urls";
import type {
  ExplorationDocument,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationThread,
} from "metabase-types/api";

import { ExplorationSidebar } from "./ExplorationSidebar";
import { getExplorationSidebarTree } from "./utils";

type TestSelectedEntityId =
  | { type: "group"; id: string }
  | { type: "document"; id: number }
  | null;

interface SetupOpts {
  queries: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
  documents?: ExplorationDocument[];
  thread?: Partial<ExplorationThread>;
  selectedQueryId?: number | null;
  selectedEntityId?: TestSelectedEntityId;
  prompt?: string | null;
  canWrite?: boolean;
}

function setup({
  queries,
  groups,
  documents,
  thread,
  selectedQueryId = null,
  selectedEntityId,
  prompt = null,
  canWrite = true,
}: SetupOpts) {
  const setSelectedEntityId = jest.fn();

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
    groups,
    documents,
    prompt,
    thread,
  });
  exploration.can_write = canWrite;

  const allGroups = exploration.threads?.flatMap((t) => t.groups ?? []) ?? [];
  const findGroupForQuery = (queryId: number) =>
    allGroups.find(
      (g) => g.parent_group_id != null && g.query_ids.includes(queryId),
    );

  let resolvedEntityId: TestSelectedEntityId;
  if (selectedEntityId !== undefined) {
    resolvedEntityId = selectedEntityId;
  } else if (selectedQueryId != null) {
    const owningGroup = findGroupForQuery(selectedQueryId);
    resolvedEntityId = owningGroup
      ? { type: "group" as const, id: owningGroup.id }
      : null;
  } else if (queries.length > 0) {
    const firstLeaf = findGroupForQuery(queries[0].id);
    resolvedEntityId = firstLeaf
      ? { type: "group" as const, id: firstLeaf.id }
      : null;
  } else {
    resolvedEntityId = null;
  }

  const getSelectedEntityIdUrl = (
    entityId: NonNullable<TestSelectedEntityId>,
  ) =>
    `${Urls.exploration(exploration.id)}/${entityId.type}/${encodeURIComponent(String(entityId.id))}`;

  const sidebar = (
    <ExplorationSidebar
      exploration={exploration}
      tree={getExplorationSidebarTree(exploration)}
      selectedEntityId={resolvedEntityId}
      setSelectedEntityId={setSelectedEntityId}
      getSelectedEntityIdUrl={getSelectedEntityIdUrl}
    />
  );

  const explorationPath = Urls.exploration(exploration.id);

  renderWithProviders(
    <Route path={explorationPath} component={() => sidebar} />,
    { withRouter: true, initialRoute: explorationPath },
  );
  return { setSelectedEntityId, getSelectedEntityIdUrl, exploration };
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
  return screen
    .getAllByRole("treeitem")
    .find((el) =>
      within(el).queryByText(name, { exact: false }),
    ) as HTMLElement;
}

describe("ExplorationSidebar", () => {
  it("shows a spinner for pending queries", () => {
    setup({ queries: [pendingQuery] });

    expect(
      within(getRow("Revenue by plan")).getByLabelText("Loading…"),
    ).toBeInTheDocument();
  });

  it("shows a chart icon for done queries", () => {
    setup({ queries: [doneQuery] });

    expect(
      within(getRow("Revenue by region")).getByLabelText("Ready"),
    ).toBeInTheDocument();
  });

  it("shows a warning icon for error queries", () => {
    setup({ queries: [errorQuery] });

    const row = getRow("Revenue by source");
    expect(
      within(row).getByLabelText("Failed to generate"),
    ).toBeInTheDocument();
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

  it("shows a stopped icon for a canceled AI summary document", async () => {
    const aiSummaryDocument = createExplorationDocument({
      id: 42,
      name: "AI Summary",
    });

    setup({
      queries: [],
      groups: [],
      documents: [aiSummaryDocument],
      thread: {
        ai_summary_document_id: aiSummaryDocument.id,
        canceled_at: "2026-04-30T00:01:00Z",
        completed_at: "2026-04-30T00:01:00Z",
      },
    });

    await userEvent.click(screen.getByRole("group", { name: /Findings/ }));

    expect(
      within(getRow("AI Summary")).getByLabelText("Stopped"),
    ).toBeInTheDocument();
  });

  describe("potentially-interesting marker", () => {
    const marker = (rowName: string) =>
      within(getRow(rowName)).queryByTestId("potentially-interesting-marker");

    it("shows the marker when the heuristic score passes the threshold", () => {
      setup({
        queries: [
          createQuery({
            id: 1,
            name: "High interest",
            status: "done",
            interestingness_score: 0.9,
          }),
        ],
      });

      expect(marker("High interest")).toBeInTheDocument();
    });

    it("hides the marker when the heuristic score is below the threshold", () => {
      setup({
        queries: [
          createQuery({
            id: 1,
            name: "Low interest",
            status: "done",
            interestingness_score: 0.2,
          }),
        ],
      });

      expect(marker("Low interest")).not.toBeInTheDocument();
    });

    it("prefers contextual over heuristic — marks when contextual passes even if heuristic does not", () => {
      setup({
        prompt: "Why are signups down?",
        queries: [
          createQuery({
            id: 1,
            name: "Contextually relevant",
            status: "done",
            interestingness_score: 0.1,
            contextual_interestingness_score: 0.95,
          }),
        ],
      });

      expect(marker("Contextually relevant")).toBeInTheDocument();
    });

    it("prefers contextual over heuristic — does not mark when contextual is low even if heuristic passes", () => {
      setup({
        queries: [
          createQuery({
            id: 1,
            name: "Not contextually relevant",
            status: "done",
            interestingness_score: 0.95,
            contextual_interestingness_score: 0.1,
          }),
        ],
      });

      expect(marker("Not contextually relevant")).not.toBeInTheDocument();
    });

    it("falls back to heuristic when contextual is missing", () => {
      setup({
        prompt: "Why are signups down?",
        queries: [
          createQuery({
            id: 1,
            name: "Heuristic fallback",
            status: "done",
            interestingness_score: 0.95,
          }),
        ],
      });

      expect(marker("Heuristic fallback")).toBeInTheDocument();
    });
  });

  it("links each row to the selected entity URL", () => {
    const { getSelectedEntityIdUrl } = setup({
      queries: [pendingQuery, doneQuery],
    });

    expect(getRow("Revenue by region")).toHaveAttribute(
      "href",
      getSelectedEntityIdUrl({
        type: "group",
        id: `auto:1:dim-${doneQuery.id}`,
      }),
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
      canceled_at: "2026-04-30T00:01:00Z",
      completed_at: "2026-04-30T00:01:00Z",
    };

    const findThreadMenuButton = () =>
      screen
        .getAllByRole("group", { name: /Initial investigation/ })
        .find((el) => within(el).queryByRole("button"));

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

    it("does not offer Stop running when the user lacks write access", () => {
      setup({ queries: [pendingQuery], canWrite: false });

      expect(findThreadMenuButton()).toBeUndefined();
    });

    it("calls restart when Restart is clicked on a canceled thread", async () => {
      fetchMock.post("path:/api/exploration/1/restart", {
        ...createExploration({ queries: [pendingQuery] }),
      });

      setup({ queries: [pendingQuery], thread: canceledThread });

      const threadHeading = findThreadMenuButton();
      expect(threadHeading).toBeDefined();

      await userEvent.click(within(threadHeading!).getByRole("button"));
      await userEvent.click(screen.getByRole("menuitem", { name: /Restart/ }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.called("path:/api/exploration/1/restart", {
            method: "POST",
          }),
        ).toBe(true);
      });
    });

    it("does not offer Restart when the thread completed without being canceled", () => {
      setup({
        queries: [pendingQuery],
        thread: { completed_at: "2026-04-30T00:01:00Z" },
      });

      // Neither Stop (completed) nor Restart (not canceled) — so no thread menu at all.
      expect(findThreadMenuButton()).toBeUndefined();
    });

    it("does not offer Restart when the user lacks write access", () => {
      setup({
        queries: [pendingQuery],
        thread: canceledThread,
        canWrite: false,
      });

      expect(findThreadMenuButton()).toBeUndefined();
    });
  });

  describe("query groups", () => {
    // Each metric heading + leaves block.
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

    const PLAN_HEADING_ID = "metric:plan";
    const REGION_HEADING_ID = "metric:region";
    const planLeafAllId = `leaf:plan:${planQueries[0].id}`;
    const planLeafUsId = `leaf:plan:${planQueries[1].id}`;
    const regionLeafAllId = `leaf:region:${regionQueries[0].id}`;
    const regionLeafEuId = `leaf:region:${regionQueries[1].id}`;

    // Two top-level metric headings, each containing two singleton leaves.
    const groups: ExplorationQueryGroup[] = [
      {
        id: PLAN_HEADING_ID,
        parent_group_id: null,
        position: 0,
        type: "auto",
        display_type: "sidebar",
        name: "Revenue by plan",
        query_ids: [],
      },
      {
        id: planLeafAllId,
        parent_group_id: PLAN_HEADING_ID,
        position: 0,
        type: "auto",
        display_type: "singleton",
        name: planQueries[0].name,
        query_ids: [planQueries[0].id],
      },
      {
        id: planLeafUsId,
        parent_group_id: PLAN_HEADING_ID,
        position: 1,
        type: "auto",
        display_type: "singleton",
        name: planQueries[1].name,
        query_ids: [planQueries[1].id],
      },
      {
        id: REGION_HEADING_ID,
        parent_group_id: null,
        position: 1,
        type: "auto",
        display_type: "sidebar",
        name: "Revenue by region",
        query_ids: [],
      },
      {
        id: regionLeafAllId,
        parent_group_id: REGION_HEADING_ID,
        position: 0,
        type: "auto",
        display_type: "singleton",
        name: regionQueries[0].name,
        query_ids: [regionQueries[0].id],
      },
      {
        id: regionLeafEuId,
        parent_group_id: REGION_HEADING_ID,
        position: 1,
        type: "auto",
        display_type: "singleton",
        name: regionQueries[1].name,
        query_ids: [regionQueries[1].id],
      },
    ];

    it("renders one collapsible heading per metric and toggles its leaf rows when clicked", async () => {
      setup({
        queries: [...planQueries, ...regionQueries],
        groups,
        selectedEntityId: { type: "group", id: planLeafAllId },
      });

      const planHeading = screen.getByRole("group", {
        name: /Revenue by plan/,
      });
      const regionHeading = screen.getByRole("group", {
        name: /Revenue by region/,
      });
      expect(planHeading).toHaveAttribute("aria-expanded", "true");
      expect(regionHeading).toHaveAttribute("aria-expanded", "false");

      // Plan leaves are in the DOM; region leaves aren't until that
      // heading is opened.
      expect(getRow("Revenue by plan (all)")).toBeInTheDocument();
      expect(
        screen.queryByText("Revenue by region (all)", { exact: false }),
      ).not.toBeInTheDocument();

      // Click the region heading → expands and reveals its leaves.
      await userEvent.click(regionHeading);
      expect(regionHeading).toHaveAttribute("aria-expanded", "true");
      expect(getRow("Revenue by region (all)")).toBeInTheDocument();
      expect(getRow("Revenue by region (EU)")).toBeInTheDocument();

      // Toggle the plan heading off — its leaves disappear; the
      // region heading stays expanded.
      await userEvent.click(planHeading);
      expect(planHeading).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByText("Revenue by plan (all)", { exact: false }),
      ).not.toBeInTheDocument();
      expect(regionHeading).toHaveAttribute("aria-expanded", "true");
    });

    it("a heading wrapping a single leaf is collapsible — collapsing it removes the leaf from the DOM", async () => {
      const onlyQuery = createQuery({
        id: 99,
        name: "Solo dimension",
        status: "done",
      });
      const HEADING_ID = "metric:solo";
      const LEAF_ID = "leaf:solo";
      setup({
        queries: [onlyQuery],
        groups: [
          {
            id: HEADING_ID,
            parent_group_id: null,
            position: 0,
            type: "auto",
            display_type: "sidebar",
            name: "Solo metric",
            query_ids: [],
          },
          {
            id: LEAF_ID,
            parent_group_id: HEADING_ID,
            position: 0,
            type: "auto",
            display_type: "singleton",
            name: onlyQuery.name,
            query_ids: [onlyQuery.id],
          },
        ],
        // Anchor selection on the leaf so the thread + metric
        // headings start auto-expanded.
        selectedEntityId: { type: "group", id: LEAF_ID },
      });

      const heading = screen.getByRole("group", { name: /Solo metric/ });
      expect(heading).toHaveAttribute("aria-expanded", "true");
      expect(getRow("Solo dimension")).toBeInTheDocument();

      // Collapsing the heading removes the lone leaf from the DOM.
      await userEvent.click(heading);
      expect(heading).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByText("Solo dimension", { exact: false }),
      ).not.toBeInTheDocument();
    });

    it("each leaf row's status icon reflects the worst-case status of its own queries (headings have no status icon)", () => {
      // One heading with three leaves: one pending, one error, one done.
      // The heading button has no status indicator — only the leaf
      // treeitems do.
      const runningLeafQueries = [
        createQuery({ id: 1001, name: "Pending leaf q1", status: "pending" }),
        createQuery({ id: 1002, name: "Pending leaf q2", status: "done" }),
      ];
      const errorLeafQueries = [
        createQuery({ id: 2001, name: "Error leaf q1", status: "done" }),
        createQuery({
          id: 2002,
          name: "Error leaf q2",
          status: "error",
          error_message: "boom",
        }),
      ];
      const doneLeafQueries = [
        createQuery({ id: 3001, name: "Done leaf q1", status: "done" }),
        createQuery({ id: 3002, name: "Done leaf q2", status: "done" }),
      ];

      const HEADING_ID = "metric:status";
      const RUNNING_LEAF_ID = "leaf:running";
      setup({
        queries: [
          ...runningLeafQueries,
          ...errorLeafQueries,
          ...doneLeafQueries,
        ],
        groups: [
          {
            id: HEADING_ID,
            parent_group_id: null,
            position: 0,
            type: "auto",
            display_type: "sidebar",
            name: "Status metric",
            query_ids: [],
          },
          {
            id: RUNNING_LEAF_ID,
            parent_group_id: HEADING_ID,
            position: 0,
            type: "auto",
            display_type: "page",
            name: "Still running",
            query_ids: runningLeafQueries.map((q) => q.id),
          },
          {
            id: "leaf:error",
            parent_group_id: HEADING_ID,
            position: 1,
            type: "auto",
            display_type: "page",
            name: "Has an error",
            query_ids: errorLeafQueries.map((q) => q.id),
          },
          {
            id: "leaf:done",
            parent_group_id: HEADING_ID,
            position: 2,
            type: "auto",
            display_type: "page",
            name: "All settled",
            query_ids: doneLeafQueries.map((q) => q.id),
          },
        ],
        // Select the first leaf so the heading auto-expands and all
        // three leaves are in the DOM.
        selectedEntityId: { type: "group", id: RUNNING_LEAF_ID },
      });

      // Leaf rows are labelled by the BE-provided group name; each row's status
      // is derived from that group's own queries.
      expect(
        within(getRow("Still running")).getByLabelText("Loading…"),
      ).toBeInTheDocument();
      expect(
        within(getRow("Has an error")).getByLabelText("Failed to generate"),
      ).toBeInTheDocument();
      expect(
        within(getRow("All settled")).getByLabelText("Ready"),
      ).toBeInTheDocument();

      // Heading has no status icon — none of the labels appear inside it.
      const heading = screen.getByRole("group", { name: /Status metric/ });
      expect(
        within(heading).queryByLabelText("Loading…"),
      ).not.toBeInTheDocument();
      expect(
        within(heading).queryByLabelText("Failed to generate"),
      ).not.toBeInTheDocument();
      expect(within(heading).queryByLabelText("Ready")).not.toBeInTheDocument();
    });

    it("auto-expands the heading that owns the selected leaf and leaves the other heading collapsed", () => {
      setup({
        queries: [...planQueries, ...regionQueries],
        groups,
        // Selecting a region leaf should bubble up the auto-expand to
        // the `Revenue by region` heading.
        selectedEntityId: { type: "group", id: regionLeafAllId },
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

    describe("display_type: page", () => {
      const pageQueries: ExplorationQuery[] = [
        createQuery({ id: 31, name: "Revenue (US)", status: "done" }),
        createQuery({ id: 32, name: "Revenue (EU)", status: "done" }),
      ];
      const PAGE_HEADING_ID = "metric:page";
      const PAGE_LEAF_ID = "leaf:page";
      const pageGroups: ExplorationQueryGroup[] = [
        {
          id: PAGE_HEADING_ID,
          parent_group_id: null,
          position: 0,
          type: "auto",
          display_type: "sidebar",
          name: "Page metric",
          query_ids: [],
        },
        {
          id: PAGE_LEAF_ID,
          parent_group_id: PAGE_HEADING_ID,
          position: 0,
          type: "auto",
          display_type: "page",
          // The leaf row is labelled by the BE-provided group name; the
          // constituent queries are fanned out behind the single row.
          name: "Revenue across regions",
          query_ids: pageQueries.map((q) => q.id),
        },
      ];

      it("renders a single `By <dimension>` leaf row that fans the queries out behind it without exposing them individually", () => {
        setup({
          queries: pageQueries,
          groups: pageGroups,
          selectedEntityId: { type: "group", id: PAGE_LEAF_ID },
        });

        // One leaf row labelled by the group name.
        expect(getRow("Revenue across regions")).toBeInTheDocument();
        // The other constituent query name is NOT exposed as its own row.
        const allRows = screen.getAllByRole("treeitem");
        expect(
          allRows.filter((row) =>
            within(row).queryByText("Revenue (EU)", { exact: false }),
          ),
        ).toHaveLength(0);
        // Exactly one treeitem (the single page-leaf) is rendered.
        expect(allRows).toHaveLength(1);
      });

      it("links the page leaf row to the selected group URL", () => {
        const { getSelectedEntityIdUrl } = setup({
          queries: pageQueries,
          groups: pageGroups,
          selectedEntityId: { type: "group", id: PAGE_LEAF_ID },
        });

        expect(getRow("Revenue across regions")).toHaveAttribute(
          "href",
          getSelectedEntityIdUrl({ type: "group", id: PAGE_LEAF_ID }),
        );
      });

      it("marks the page leaf row as selected when its group is the selected entity", () => {
        setup({
          queries: pageQueries,
          groups: pageGroups,
          selectedEntityId: { type: "group", id: PAGE_LEAF_ID },
        });

        expect(getRow("Revenue across regions")).toHaveAttribute(
          "aria-selected",
          "true",
        );
      });

      it("a mixed-status page leaf reports the worst-case status on its single row", () => {
        const mixedPageQueries = [
          createQuery({ id: 41, name: "OK query", status: "done" }),
          createQuery({
            id: 42,
            name: "Boom query",
            status: "error",
            error_message: "kaboom",
          }),
        ];
        const MIXED_LEAF_ID = "leaf:mixed-page";
        setup({
          queries: mixedPageQueries,
          groups: [
            {
              id: PAGE_HEADING_ID,
              parent_group_id: null,
              position: 0,
              type: "auto",
              display_type: "sidebar",
              name: "Mixed metric",
              query_ids: [],
            },
            {
              id: MIXED_LEAF_ID,
              parent_group_id: PAGE_HEADING_ID,
              position: 0,
              type: "auto",
              display_type: "page",
              name: "Mixed page",
              query_ids: mixedPageQueries.map((q) => q.id),
            },
          ],
          selectedEntityId: { type: "group", id: MIXED_LEAF_ID },
        });

        // The error wins — the row's icon is the warning.
        expect(
          within(getRow("Mixed page")).getByLabelText("Failed to generate"),
        ).toBeInTheDocument();
      });
    });

    describe("arrow-key navigation", () => {
      it("Right moves selection from one leaf to the next within the same heading and keeps that heading expanded", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          selectedEntityId: { type: "group", id: planLeafAllId },
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "group",
          id: planLeafUsId,
        });
        // Region heading stayed closed; we never left the plan heading.
        const regionHeading = screen.getByRole("group", {
          name: /Revenue by region/,
        });
        expect(regionHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Right past the last leaf in a heading selects the first leaf of the next heading and collapses the source heading", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          // Selection sits on the LAST leaf of the plan heading.
          selectedEntityId: { type: "group", id: planLeafUsId },
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "group",
          id: regionLeafAllId,
        });

        // The keyboard handler imperatively collapses the source
        // heading via `treeController.collapse`. Auto-expanding the
        // target heading happens via `getInitialExpandedIds` on the
        // next render — that's a parent-side effect we don't model
        // here (the `setSelectedEntityId` is a mock so the controlled
        // `selectedEntityId` prop never updates).
        const planHeading = screen.getByRole("group", {
          name: /Revenue by plan/,
        });
        expect(planHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Left past the first leaf in a heading selects the last leaf of the previous heading and collapses the source heading", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          selectedEntityId: { type: "group", id: regionLeafAllId },
        });

        fireEvent.keyDown(document.body, { key: "ArrowLeft" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "group",
          id: planLeafUsId,
        });

        const regionHeading = screen.getByRole("group", {
          name: /Revenue by region/,
        });
        expect(regionHeading).toHaveAttribute("aria-expanded", "false");
      });

      it("Right onto a page leaf in a different heading still dispatches a group selection and collapses the source heading", () => {
        const pageQueriesNav = [
          createQuery({ id: 101, name: "Page q1", status: "done" }),
          createQuery({ id: 102, name: "Page q2", status: "done" }),
        ];
        const PAGE_HEADING = "metric:page-after";
        const PAGE_LEAF = "leaf:page-after";
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...pageQueriesNav],
          groups: [
            ...groups.slice(0, 3), // plan heading + its two singleton leaves
            {
              id: PAGE_HEADING,
              parent_group_id: null,
              position: 1,
              type: "auto",
              display_type: "sidebar",
              name: "Page after plan",
              query_ids: [],
            },
            {
              id: PAGE_LEAF,
              parent_group_id: PAGE_HEADING,
              position: 0,
              type: "auto",
              display_type: "page",
              name: "Page leaf",
              query_ids: pageQueriesNav.map((q) => q.id),
            },
          ],
          // Selection on the last plan leaf — Right should bridge to
          // the next heading's first (and only) leaf.
          selectedEntityId: { type: "group", id: planLeafUsId },
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "group",
          id: PAGE_LEAF,
        });
        const planHeading = screen.getByRole("group", {
          name: /Revenue by plan/,
        });
        expect(planHeading).toHaveAttribute("aria-expanded", "false");
      });
    });
  });
});
