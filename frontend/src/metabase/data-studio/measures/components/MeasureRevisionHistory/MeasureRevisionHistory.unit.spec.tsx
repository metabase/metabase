import fetchMock from "fetch-mock";

import { setupMeasureRevisionsEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Measure, Revision } from "metabase-types/api";
import {
  createMockMeasure,
  createMockRevision,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { MeasureRevisionHistory } from "./MeasureRevisionHistory";

const TEST_MEASURE = createMockMeasure({
  id: 1,
  name: "Test Measure",
  table_id: 42,
});

type SetupOpts = {
  measure?: Measure;
  revisions?: Revision[];
  hasError?: boolean;
  currentUserId?: number;
};

function setup({
  measure = TEST_MEASURE,
  revisions = [],
  hasError = false,
  currentUserId = 1,
}: SetupOpts = {}) {
  if (hasError) {
    fetchMock.get(`path:/api/revision?entity=measure&id=${measure.id}`, {
      status: 500,
      body: "Server error",
    });
  } else {
    setupMeasureRevisionsEndpoint(measure.id, revisions);
  }

  const storeInitialState = createMockState({
    currentUser: createMockUser({
      id: currentUserId,
      first_name: "Current",
      last_name: "User",
      common_name: "Current User",
    }),
  });

  renderWithProviders(<MeasureRevisionHistory measure={measure} />, {
    storeInitialState,
  });
}

describe("MeasureRevisionHistory", () => {
  it("shows loading state while fetching revisions", async () => {
    setup({ revisions: [] });
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
  });

  it("shows error state when API fails", async () => {
    setup({ hasError: true });
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Server error")).toBeInTheDocument();
  });

  it("shows empty state message when no revisions exist", async () => {
    setup({ revisions: [] });
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText("No revision history available."),
    ).toBeInTheDocument();
  });

  it("renders revision with user name, action, and avatar initials", async () => {
    const revisions = [
      createMockRevision({
        id: 1,
        is_creation: true,
        user: {
          id: 99,
          first_name: "John",
          last_name: "Doe",
          common_name: "John Doe",
        },
      }),
    ];

    setup({ revisions });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("John Doe")).toBeInTheDocument();
    expect(screen.getByText("created this measure")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("shows 'You' instead of name for current user's revisions", async () => {
    const revisions = [
      createMockRevision({
        id: 1,
        is_creation: true,
        user: {
          id: 1,
          first_name: "Current",
          last_name: "User",
          common_name: "Current User",
        },
      }),
    ];

    setup({ revisions, currentUserId: 1 });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.queryByText("Current User")).not.toBeInTheDocument();
  });

  it("displays multiple revision items with different users", async () => {
    const revisions = [
      createMockRevision({
        id: 2,
        is_creation: false,
        diff: { name: { before: "Old", after: "New" } },
        user: {
          id: 98,
          first_name: "Alice",
          last_name: "Smith",
          common_name: "Alice Smith",
        },
      }),
      createMockRevision({
        id: 1,
        is_creation: true,
        user: {
          id: 99,
          first_name: "Bob",
          last_name: "Jones",
          common_name: "Bob Jones",
        },
      }),
    ];

    setup({ revisions });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("renamed the measure")).toBeInTheDocument();
    expect(screen.getByText("created this measure")).toBeInTheDocument();
  });

  it("shows correct action descriptions for different change types", async () => {
    const revisions = [
      createMockRevision({
        id: 4,
        is_creation: false,
        is_reversion: true,
        user: {
          id: 96,
          first_name: "D",
          last_name: "D",
          common_name: "User D",
        },
      }),
      createMockRevision({
        id: 3,
        is_creation: false,
        diff: { description: { before: "Old", after: "New" } },
        user: {
          id: 97,
          first_name: "C",
          last_name: "C",
          common_name: "User C",
        },
      }),
      createMockRevision({
        id: 2,
        is_creation: false,
        diff: {
          definition: {
            before: { aggregation: [["sum", ["field", 1, null]]] },
            after: { aggregation: [["count"]] },
          },
        },
        user: {
          id: 98,
          first_name: "B",
          last_name: "B",
          common_name: "User B",
        },
      }),
      createMockRevision({
        id: 1,
        is_creation: true,
        user: {
          id: 99,
          first_name: "A",
          last_name: "A",
          common_name: "User A",
        },
      }),
    ];

    setup({ revisions });
    await waitForLoaderToBeRemoved();

    expect(
      screen.getByText("reverted to a previous version"),
    ).toBeInTheDocument();
    expect(screen.getByText("updated the description")).toBeInTheDocument();
    expect(
      screen.getByText("changed the aggregation definition"),
    ).toBeInTheDocument();
    expect(screen.getByText("created this measure")).toBeInTheDocument();
  });

  it("shows 'made multiple changes' for multi-field updates and 'made changes' for empty diff", async () => {
    const revisions = [
      createMockRevision({
        id: 2,
        is_creation: false,
        diff: {
          name: { before: "Old", after: "New" },
          description: { before: "Old desc", after: "New desc" },
        },
        user: {
          id: 98,
          first_name: "A",
          last_name: "A",
          common_name: "User A",
        },
      }),
      createMockRevision({
        id: 1,
        is_creation: false,
        diff: {},
        user: {
          id: 99,
          first_name: "B",
          last_name: "B",
          common_name: "User B",
        },
      }),
    ];

    setup({ revisions });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("made multiple changes")).toBeInTheDocument();
    expect(screen.getByText("made changes")).toBeInTheDocument();
  });

  it("displays revision message when provided, omits when null", async () => {
    const revisions = [
      createMockRevision({
        id: 2,
        is_creation: false,
        message: "Updated from Data Studio",
        diff: { name: { before: "Old", after: "New" } },
        user: {
          id: 98,
          first_name: "A",
          last_name: "A",
          common_name: "User A",
        },
      }),
      createMockRevision({
        id: 1,
        is_creation: false,
        message: null,
        diff: { description: { before: "Old", after: "New" } },
        user: {
          id: 99,
          first_name: "B",
          last_name: "B",
          common_name: "User B",
        },
      }),
    ];

    setup({ revisions });
    await waitForLoaderToBeRemoved();

    expect(screen.getByText("Updated from Data Studio")).toBeInTheDocument();
    expect(screen.getAllByText(/User [AB]/)).toHaveLength(2);
  });
});
