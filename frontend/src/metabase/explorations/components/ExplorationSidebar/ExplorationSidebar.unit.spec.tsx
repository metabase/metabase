import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, within } from "__support__/ui";
import type {
  Exploration,
  ExplorationQuery,
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

function createExploration(queries: ExplorationQuery[]): {
  exploration: Exploration;
  threadsWithSortedQueries: ThreadsWithSortedQueries[];
} {
  // TODO: sort queries
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
  selectedQueryId?: number | null;
}

function setup({ queries, selectedQueryId = null }: SetupOpts) {
  const setSelectedQueryId = jest.fn();

  const { exploration, threadsWithSortedQueries } = createExploration(queries);

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
});
