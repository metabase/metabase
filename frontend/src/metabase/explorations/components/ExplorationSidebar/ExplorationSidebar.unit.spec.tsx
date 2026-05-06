import userEvent from "@testing-library/user-event";

import { fireEvent, renderWithProviders, screen, within } from "__support__/ui";
import type {
  Exploration,
  ExplorationQuery,
  ExplorationQueryGroup,
  ExplorationQueryStatus,
  ThreadsWithSortedQueries,
} from "metabase-types/api";

import { ExplorationSidebar } from "./ExplorationSidebar";

function createQuery(
  overrides: Partial<ExplorationQuery> & {
    id: number;
    name: string;
    status: ExplorationQueryStatus;
  },
): ExplorationQuery {
  return {
    exploration_thread_id: 1,
    card_id: 1,
    dimension_id: "dim-1",
    position: 0,
    error_message: null,
    started_at: null,
    finished_at: null,
    entity_id: "abc123def456ghij78901",
    interestingness_score: null,
    dataset_query: { type: "query", database: 1, query: {} } as any,
    segment_id: null,
    ...overrides,
  };
}

interface CreateExplorationOpts {
  queries: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
}

function createExploration({ queries, groups }: CreateExplorationOpts): {
  exploration: Exploration;
  threadsWithSortedQueries: ThreadsWithSortedQueries[];
} {
  // Default to one `singleton` auto-group per query so each query renders
  // as a flat row (singleton groups skip the collapsible wrapper). Tests
  // that need multi-query groups pass `groups` explicitly.
  const finalGroups: ExplorationQueryGroup[] =
    groups ??
    queries.map((q, i) => ({
      id: `auto:1:dim-${q.id}`,
      parent_group_id: null,
      position: i,
      type: "auto" as const,
      display_type: "singleton" as const,
      name: q.name,
      query_ids: [q.id],
    }));

  const threads = [
    {
      id: 1,
      exploration_id: 1,
      name: null,
      prompt: null,
      position: 0,
      started_at: "2026-04-30T00:00:00Z",
      entity_id: "thrd00000000000000001",
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
      queries,
      groups: finalGroups,
    },
  ];

  const exploration = {
    id: 1,
    name: "My exploration",
    description: null,
    creator_id: 1,
    archived: false,
    entity_id: "expl00000000000000001",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    threads,
  };

  // Test fixture: queries are constructed via `createQuery` which returns
  // the wider `ExplorationQuery` (`name: string | null`); the prod page
  // narrows to `ExplorationQueryWithName` by filtering. We trust the
  // fixture inputs here and cast.
  return {
    exploration,
    threadsWithSortedQueries: threads as ThreadsWithSortedQueries[],
  };
}

type TestSelectedEntityId =
  | { type: "query"; id: number }
  | { type: "group"; id: string }
  | { type: "document"; id: number }
  | null;

interface SetupOpts {
  queries: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
  selectedQueryId?: number | null;
  selectedEntityId?: TestSelectedEntityId;
}

function setup({
  queries,
  groups,
  selectedQueryId = null,
  selectedEntityId,
}: SetupOpts) {
  const setSelectedEntityId = jest.fn();

  const { exploration, threadsWithSortedQueries } = createExploration({
    queries,
    groups,
  });

  const resolvedEntityId =
    selectedEntityId !== undefined
      ? selectedEntityId
      : selectedQueryId == null
        ? null
        : { type: "query" as const, id: selectedQueryId };

  renderWithProviders(
    <ExplorationSidebar
      exploration={exploration}
      selectedEntityId={resolvedEntityId}
      setSelectedEntityId={setSelectedEntityId}
      threadsWithSortedQueries={threadsWithSortedQueries}
    />,
  );
  return { setSelectedEntityId };
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
    .getAllByRole("listitem")
    .find((el) => within(el).queryByText(name)) as HTMLElement;
}

describe("ExplorationSidebar", () => {
  it("shows a spinner for pending queries", () => {
    setup({ queries: [pendingQuery] });

    expect(
      within(getRow("Revenue by plan")).getByLabelText("Generating chart…"),
    ).toBeInTheDocument();
  });

  it("shows a chart icon for done queries", () => {
    setup({ queries: [doneQuery] });

    expect(
      within(getRow("Revenue by region")).getByLabelText("Chart ready"),
    ).toBeInTheDocument();
  });

  it("shows a warning icon and the error message tooltip for error queries", async () => {
    setup({ queries: [errorQuery] });

    const row = getRow("Revenue by source");
    expect(
      within(row).getByLabelText("Failed to generate chart"),
    ).toBeInTheDocument();

    await userEvent.hover(row);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Database timed out",
    );
  });

  it("calls setSelectedEntityId when a row is clicked", async () => {
    const { setSelectedEntityId } = setup({
      queries: [pendingQuery, doneQuery],
    });

    await userEvent.click(getRow("Revenue by region"));

    expect(setSelectedEntityId).toHaveBeenCalledWith({
      type: "query",
      id: doneQuery.id,
    });
  });

  it("marks the selected query row as pressed", () => {
    setup({
      queries: [pendingQuery, doneQuery],
      selectedQueryId: doneQuery.id,
    });

    expect(getRow("Revenue by region")).toHaveAttribute("aria-pressed", "true");
    expect(getRow("Revenue by plan")).toHaveAttribute("aria-pressed", "false");
  });

  describe("query groups", () => {
    const planQueries: ExplorationQuery[] = [
      createQuery({ id: 11, name: "Revenue by plan (all)", status: "done" }),
      createQuery({
        id: 12,
        name: "Revenue by plan (US)",
        status: "done",
      }),
    ];
    const regionQueries: ExplorationQuery[] = [
      createQuery({ id: 21, name: "Revenue by region (all)", status: "done" }),
      createQuery({
        id: 22,
        name: "Revenue by region (EU)",
        status: "done",
      }),
    ];
    const groups: ExplorationQueryGroup[] = [
      {
        id: "auto:1:plan",
        parent_group_id: null,
        position: 0,
        type: "auto",
        display_type: "sidebar",
        name: "Revenue by plan",
        query_ids: planQueries.map((q) => q.id),
      },
      {
        id: "auto:1:region",
        parent_group_id: null,
        position: 1,
        type: "auto",
        display_type: "sidebar",
        name: "Revenue by region",
        query_ids: regionQueries.map((q) => q.id),
      },
    ];

    it("renders one collapsible header per multi-query group; expanded panel shows the queries", async () => {
      const { setSelectedEntityId } = setup({
        queries: [...planQueries, ...regionQueries],
        groups,
      });

      // Headers are visible and report collapsed by default.
      const planHeader = screen.getByRole("button", {
        name: /Revenue by plan/,
      });
      const regionHeader = screen.getByRole("button", {
        name: /Revenue by region/,
      });
      expect(planHeader).toHaveAttribute("aria-expanded", "false");
      expect(regionHeader).toHaveAttribute("aria-expanded", "false");

      // Bodies are hidden by default.
      expect(
        screen.queryByText("Revenue by plan (all)"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("Revenue by region (all)"),
      ).not.toBeInTheDocument();

      // Expand the plan group → its queries become visible AND the first
      // query gets selected.
      await userEvent.click(planHeader);
      expect(planHeader).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Revenue by plan (all)")).toBeInTheDocument();
      expect(setSelectedEntityId).toHaveBeenLastCalledWith({
        type: "query",
        id: planQueries[0].id,
      });
      expect(
        screen.queryByText("Revenue by region (all)"),
      ).not.toBeInTheDocument();

      // Collapse the plan group → its queries hide.
      await userEvent.click(planHeader);
      expect(planHeader).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByText("Revenue by plan (all)"),
      ).not.toBeInTheDocument();
    });

    it("single-query groups render the lone query directly without a group header", () => {
      const onlyQuery = createQuery({
        id: 99,
        name: "Solo dimension",
        status: "done",
      });
      setup({
        queries: [onlyQuery],
        groups: [
          {
            id: "auto:1:solo",
            parent_group_id: null,
            position: 0,
            type: "auto",
            display_type: "singleton",
            name: "Solo dimension",
            query_ids: [onlyQuery.id],
          },
        ],
      });

      // The query row is visible directly — no expandable header for the group.
      expect(getRow("Solo dimension")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { expanded: false }),
      ).not.toBeInTheDocument();
    });

    it("group header status reflects the worst case across its queries", () => {
      const runningGroupQueries = [
        createQuery({ id: 1001, name: "Q1", status: "pending" }),
        createQuery({ id: 1002, name: "Q2", status: "done" }),
      ];
      const errorGroupQueries = [
        createQuery({ id: 2001, name: "Q3", status: "done" }),
        createQuery({
          id: 2002,
          name: "Q4",
          status: "error",
          error_message: "boom",
        }),
      ];
      const doneGroupQueries = [
        createQuery({ id: 3001, name: "Q5", status: "done" }),
        createQuery({ id: 3002, name: "Q6", status: "done" }),
      ];
      const statusGroups: ExplorationQueryGroup[] = [
        {
          id: "g-running",
          parent_group_id: null,
          position: 0,
          type: "auto",
          display_type: "sidebar",
          name: "Still running",
          query_ids: runningGroupQueries.map((q) => q.id),
        },
        {
          id: "g-error",
          parent_group_id: null,
          position: 1,
          type: "auto",
          display_type: "sidebar",
          name: "Has an error",
          query_ids: errorGroupQueries.map((q) => q.id),
        },
        {
          id: "g-done",
          parent_group_id: null,
          position: 2,
          type: "auto",
          display_type: "sidebar",
          name: "All settled",
          query_ids: doneGroupQueries.map((q) => q.id),
        },
      ];

      setup({
        queries: [
          ...runningGroupQueries,
          ...errorGroupQueries,
          ...doneGroupQueries,
        ],
        groups: statusGroups,
      });

      const runningHeader = screen.getByRole("button", {
        name: /Still running/,
      });
      const errorHeader = screen.getByRole("button", {
        name: /Has an error/,
      });
      const doneHeader = screen.getByRole("button", { name: /All settled/ });

      expect(
        within(runningHeader).getByLabelText("Generating chart…"),
      ).toBeInTheDocument();
      expect(
        within(errorHeader).getByLabelText("Failed to generate chart"),
      ).toBeInTheDocument();
      expect(
        within(doneHeader).getByLabelText("Chart ready"),
      ).toBeInTheDocument();
    });

    it("auto-expands the group containing the selected query", () => {
      setup({
        queries: [...planQueries, ...regionQueries],
        groups,
        selectedQueryId: regionQueries[0].id,
      });

      const planHeader = screen.getByRole("button", {
        name: /Revenue by plan/,
      });
      const regionHeader = screen.getByRole("button", {
        name: /Revenue by region/,
      });

      // The region group contains the selection so it auto-opens; the
      // plan group stays collapsed.
      expect(regionHeader).toHaveAttribute("aria-expanded", "true");
      expect(planHeader).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("Revenue by region (all)")).toBeInTheDocument();
      expect(
        screen.queryByText("Revenue by plan (all)"),
      ).not.toBeInTheDocument();
    });

    describe("display_type: page", () => {
      const pageQueries: ExplorationQuery[] = [
        createQuery({ id: 31, name: "Revenue (US)", status: "done" }),
        createQuery({ id: 32, name: "Revenue (EU)", status: "done" }),
      ];
      const pageGroup: ExplorationQueryGroup = {
        id: "auto:1:revenue-page",
        parent_group_id: null,
        position: 0,
        type: "auto",
        display_type: "page",
        name: "Revenue across regions",
        query_ids: pageQueries.map((q) => q.id),
      };

      it("renders a single sidebar row labeled with the group's name and exposes no individual queries", () => {
        setup({ queries: pageQueries, groups: [pageGroup] });

        // The group's name is visible…
        expect(getRow("Revenue across regions")).toBeInTheDocument();
        // …and the individual queries' names are NOT exposed in the
        // sidebar.
        expect(screen.queryByText("Revenue (US)")).not.toBeInTheDocument();
        expect(screen.queryByText("Revenue (EU)")).not.toBeInTheDocument();
        // No expand/collapse chevron either.
        expect(
          screen.queryByRole("button", { expanded: false }),
        ).not.toBeInTheDocument();
      });

      it("clicking the row selects the group entity (not a query)", async () => {
        const { setSelectedEntityId } = setup({
          queries: pageQueries,
          groups: [pageGroup],
        });

        await userEvent.click(getRow("Revenue across regions"));

        expect(setSelectedEntityId).toHaveBeenCalledWith({
          type: "group",
          id: pageGroup.id,
        });
      });

      it("marks the selected group row as pressed when the entity matches", () => {
        const setSelectedEntityId = jest.fn();
        const { exploration, threadsWithSortedQueries } = createExploration({
          queries: pageQueries,
          groups: [pageGroup],
        });
        renderWithProviders(
          <ExplorationSidebar
            exploration={exploration}
            selectedEntityId={{ type: "group", id: pageGroup.id }}
            setSelectedEntityId={setSelectedEntityId}
            threadsWithSortedQueries={threadsWithSortedQueries}
          />,
        );

        expect(getRow("Revenue across regions")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      });

      it("group row status reflects the worst case across its queries", () => {
        const mixedPageQueries = [
          createQuery({ id: 41, name: "OK", status: "done" }),
          createQuery({
            id: 42,
            name: "Boom",
            status: "error",
            error_message: "kaboom",
          }),
        ];
        setup({
          queries: mixedPageQueries,
          groups: [
            {
              ...pageGroup,
              id: "auto:1:mixed-page",
              query_ids: mixedPageQueries.map((q) => q.id),
              name: "Mixed page",
            },
          ],
        });

        expect(
          within(getRow("Mixed page")).getByLabelText(
            "Failed to generate chart",
          ),
        ).toBeInTheDocument();
      });
    });

    describe("arrow-key navigation", () => {
      it("Right advances to the next query within the same group", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          selectedQueryId: planQueries[0].id,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        // Selection moves to the second query of the same group.
        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "query",
          id: planQueries[1].id,
        });
        // The plan group stays open; the region group remains collapsed.
        const regionHeader = screen.getByRole("button", {
          name: /Revenue by region/,
        });
        expect(regionHeader).toHaveAttribute("aria-expanded", "false");
      });

      it("Right at the last query in a group collapses it, expands the next, and selects its first query", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          selectedQueryId: planQueries[planQueries.length - 1].id,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "query",
          id: regionQueries[0].id,
        });

        const planHeader = screen.getByRole("button", {
          name: /Revenue by plan/,
        });
        const regionHeader = screen.getByRole("button", {
          name: /Revenue by region/,
        });
        expect(planHeader).toHaveAttribute("aria-expanded", "false");
        expect(regionHeader).toHaveAttribute("aria-expanded", "true");
      });

      it("Left at the first query in a group collapses it, expands the previous, and selects its last query", () => {
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...regionQueries],
          groups,
          selectedQueryId: regionQueries[0].id,
        });

        fireEvent.keyDown(document.body, { key: "ArrowLeft" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "query",
          id: planQueries[planQueries.length - 1].id,
        });

        const planHeader = screen.getByRole("button", {
          name: /Revenue by plan/,
        });
        const regionHeader = screen.getByRole("button", {
          name: /Revenue by region/,
        });
        expect(planHeader).toHaveAttribute("aria-expanded", "true");
        expect(regionHeader).toHaveAttribute("aria-expanded", "false");
      });

      it("Right onto a page group selects the group entity (and collapses the source sidebar group)", () => {
        const pageGroupNav: ExplorationQueryGroup = {
          id: "auto:1:page-after-plan",
          parent_group_id: null,
          position: 1,
          type: "auto",
          display_type: "page",
          name: "Page after plan",
          query_ids: [101, 102],
        };
        const pageQueriesNav = [
          createQuery({ id: 101, name: "Page q1", status: "done" }),
          createQuery({ id: 102, name: "Page q2", status: "done" }),
        ];
        const { setSelectedEntityId } = setup({
          queries: [...planQueries, ...pageQueriesNav],
          groups: [
            {
              ...groups[0], // plan group, sidebar
              position: 0,
            },
            pageGroupNav,
          ],
          selectedQueryId: planQueries[planQueries.length - 1].id,
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "group",
          id: pageGroupNav.id,
        });
        // The plan (sidebar) group collapses since we left it.
        const planHeader = screen.getByRole("button", {
          name: /Revenue by plan/,
        });
        expect(planHeader).toHaveAttribute("aria-expanded", "false");
      });

      it("Right from a selected page group advances to the next entity", () => {
        const pageGroupNav: ExplorationQueryGroup = {
          id: "auto:1:page-before-region",
          parent_group_id: null,
          position: 0,
          type: "auto",
          display_type: "page",
          name: "Page before region",
          query_ids: [201, 202],
        };
        const pageQueriesNav = [
          createQuery({ id: 201, name: "Page q1", status: "done" }),
          createQuery({ id: 202, name: "Page q2", status: "done" }),
        ];
        const { setSelectedEntityId } = setup({
          queries: [...pageQueriesNav, ...regionQueries],
          groups: [
            pageGroupNav,
            {
              ...groups[1], // region group, sidebar
              position: 1,
            },
          ],
          selectedEntityId: { type: "group", id: pageGroupNav.id },
        });

        fireEvent.keyDown(document.body, { key: "ArrowRight" });

        // Lands on the first query of the region (sidebar) group, which
        // also auto-expands.
        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "query",
          id: regionQueries[0].id,
        });
        const regionHeader = screen.getByRole("button", {
          name: /Revenue by region/,
        });
        expect(regionHeader).toHaveAttribute("aria-expanded", "true");
      });

      it("Left from a selected page group lands on the previous singleton query", () => {
        const singletonQuery = createQuery({
          id: 901,
          name: "Solo before page",
          status: "done",
        });
        const pageGroupNav: ExplorationQueryGroup = {
          id: "auto:1:page-trailing",
          parent_group_id: null,
          position: 1,
          type: "auto",
          display_type: "page",
          name: "Trailing page",
          query_ids: [301, 302],
        };
        const pageQueriesNav = [
          createQuery({ id: 301, name: "Page q1", status: "done" }),
          createQuery({ id: 302, name: "Page q2", status: "done" }),
        ];
        const { setSelectedEntityId } = setup({
          queries: [singletonQuery, ...pageQueriesNav],
          groups: [
            {
              id: "auto:1:singleton",
              parent_group_id: null,
              position: 0,
              type: "auto",
              display_type: "singleton",
              name: "Solo before page",
              query_ids: [singletonQuery.id],
            },
            pageGroupNav,
          ],
          selectedEntityId: { type: "group", id: pageGroupNav.id },
        });

        fireEvent.keyDown(document.body, { key: "ArrowLeft" });

        expect(setSelectedEntityId).toHaveBeenLastCalledWith({
          type: "query",
          id: singletonQuery.id,
        });
      });
    });
  });
});
