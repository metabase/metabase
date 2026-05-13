import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  ExplorationDocument,
  ExplorationQuery,
  ExplorationThread,
} from "metabase-types/api";

import { GroupDocumentMenu } from "./GroupDocumentMenu";

const mockAppend = jest.fn();
const mockCreate = jest.fn();
const mockToast = jest.fn();

jest.mock("metabase/api/exploration", () => ({
  __esModule: true,
  useAppendChartToDocumentMutation: () => [
    (...args: unknown[]) => mockAppend(...args),
  ],
  useCreateExplorationDocumentMutation: () => [
    (...args: unknown[]) => mockCreate(...args),
  ],
}));

// Stub `useToast` directly at the submodule path so other consumers of
// `metabase/common/hooks` (used by `renderWithProviders`) keep working
// against the real implementation.
jest.mock("metabase/common/hooks/use-toast", () => ({
  __esModule: true,
  useToast: () => [mockToast],
}));

function makeQuery(id: number, name: string): ExplorationQuery {
  return {
    id,
    exploration_thread_id: 1,
    card_id: 1,
    dimension_id: "dim-1",
    dimension_name: "Dim 1",
    name,
    position: 0,
    status: "done",
    error_message: null,
    started_at: null,
    finished_at: null,
    entity_id: "abcdefghijabcdefghij1",
    interestingness_score: 0.5,
    dataset_query: { type: "query", database: 1, query: {} } as any,
    segment_id: null,
  };
}

function makeDocument(
  overrides: Partial<ExplorationDocument> & { id: number; name: string },
): ExplorationDocument {
  return {
    exploration_thread_id: 1,
    creator_id: 1,
    content_type: "application/json",
    ...overrides,
  };
}

const queries = [
  makeQuery(101, "Revenue (US)"),
  makeQuery(102, "Revenue (EU)"),
];

function makeThread(documents: ExplorationDocument[] = []): ExplorationThread {
  return {
    id: 7,
    exploration_id: 99,
    name: null,
    prompt: null,
    position: 0,
    started_at: null,
    completed_at: null,
    entity_id: "thrd00000000000000007",
    created_at: "2026-04-30T00:00:00Z",
    updated_at: "2026-04-30T00:00:00Z",
    documents,
  };
}

function setup(
  documents: ExplorationDocument[] = [makeDocument({ id: 11, name: "Notes" })],
  display: "line" | "bar" | undefined = "line",
) {
  renderWithProviders(
    <GroupDocumentMenu
      queries={queries}
      explorationThread={makeThread(documents)}
      display={display}
    />,
  );
}

beforeEach(() => {
  mockAppend.mockReset();
  mockAppend.mockResolvedValue({
    data: { id: 11, name: "Notes" },
  });
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    data: { id: 22, name: "Untitled" },
  });
  mockToast.mockReset();
});

describe("GroupDocumentMenu", () => {
  it("first stage shows the group's queries — not the documents", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );

    expect(await screen.findByText("Pick a chart")).toBeInTheDocument();
    expect(screen.getByText("Revenue (US)")).toBeInTheDocument();
    expect(screen.getByText("Revenue (EU)")).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("picking a chart advances to the document picker", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));

    expect(await screen.findByText("Add to")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("New document")).toBeInTheDocument();
    // The chart list is no longer shown.
    expect(screen.queryByText("Revenue (EU)")).not.toBeInTheDocument();
  });

  it("Back returns to the chart picker without committing", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));
    await userEvent.click(await screen.findByText("Back"));

    expect(await screen.findByText("Pick a chart")).toBeInTheDocument();
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it("clicking a document appends the picked chart with the right query+document ids and the rendered display", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (EU)"));
    await userEvent.click(await screen.findByText("Notes"));

    await waitFor(() => {
      expect(mockAppend).toHaveBeenCalledTimes(1);
    });
    expect(mockAppend).toHaveBeenCalledWith({
      threadId: 7,
      documentId: 11,
      exploration_query_id: 102,
      display: "line",
    });
  });

  it("New document creates a doc and then appends the picked chart to it", async () => {
    setup();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to document" }),
    );
    await userEvent.click(await screen.findByText("Revenue (US)"));
    await userEvent.click(await screen.findByText("New document"));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        threadId: 7,
        explorationId: 99,
      });
    });
    await waitFor(() => {
      expect(mockAppend).toHaveBeenCalledWith({
        threadId: 7,
        documentId: 22, // the freshly-created document
        exploration_query_id: 101,
        display: "line",
      });
    });
  });
});
