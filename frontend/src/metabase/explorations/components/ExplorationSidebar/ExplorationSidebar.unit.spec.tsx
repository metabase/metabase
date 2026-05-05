import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
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
  // Default to one auto-group per query so each query renders as a flat row
  // (single-query groups skip the collapsible wrapper). Tests that need
  // multi-query groups pass `groups` explicitly.
  const finalGroups: ExplorationQueryGroup[] =
    groups ??
    queries.map((q, i) => ({
      id: `auto:1:dim-${q.id}`,
      parent_group_id: null,
      position: i,
      type: "auto" as const,
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

  return { exploration, threadsWithSortedQueries: threads };
}

interface SetupOpts {
  queries: ExplorationQuery[];
  groups?: ExplorationQueryGroup[];
  selectedQueryId?: number | null;
}

function setup({ queries, groups, selectedQueryId = null }: SetupOpts) {
  const setSelectedQueryId = jest.fn();

  const { exploration, threadsWithSortedQueries } = createExploration({
    queries,
    groups,
  });

  renderWithProviders(
    <ExplorationSidebar
      exploration={exploration}
      selectedQueryId={selectedQueryId}
      setSelectedQueryId={setSelectedQueryId}
      threadsWithSortedQueries={threadsWithSortedQueries}
    />,
  );
  return { setSelectedQueryId };
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

  it("calls setSelectedQueryId when a row is clicked", async () => {
    const { setSelectedQueryId } = setup({
      queries: [pendingQuery, doneQuery],
    });

    await userEvent.click(getRow("Revenue by region"));

    expect(setSelectedQueryId).toHaveBeenCalledWith(doneQuery.id);
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
        name: "Revenue by plan",
        query_ids: planQueries.map((q) => q.id),
      },
      {
        id: "auto:1:region",
        parent_group_id: null,
        position: 1,
        type: "auto",
        name: "Revenue by region",
        query_ids: regionQueries.map((q) => q.id),
      },
    ];

    it("renders one collapsible header per multi-query group; expanded panel shows the queries", async () => {
      const { setSelectedQueryId } = setup({
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
      expect(setSelectedQueryId).toHaveBeenLastCalledWith(planQueries[0].id);
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
          name: "Still running",
          query_ids: runningGroupQueries.map((q) => q.id),
        },
        {
          id: "g-error",
          parent_group_id: null,
          position: 1,
          type: "auto",
          name: "Has an error",
          query_ids: errorGroupQueries.map((q) => q.id),
        },
        {
          id: "g-done",
          parent_group_id: null,
          position: 2,
          type: "auto",
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
  });
});
