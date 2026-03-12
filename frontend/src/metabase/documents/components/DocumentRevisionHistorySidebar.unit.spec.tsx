import userEvent from "@testing-library/user-event";

import {
  setupDocumentRevisionsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Document, Revision } from "metabase-types/api";
import {
  createMockDocument,
  createMockRevision,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { DocumentRevisionHistorySidebar } from "./DocumentRevisionHistorySidebar";

const mockUser = createMockUser();

const mockRevisions: Revision[] = [
  createMockRevision({
    id: 2,
    description: 'renamed this Document from "Old Name" to "Test Document".',
    timestamp: "2024-01-02T10:00:00Z",
    user: {
      id: mockUser.id,
      first_name: mockUser.first_name ?? "",
      last_name: mockUser.last_name ?? "",
      common_name: mockUser.common_name ?? "",
    },
  }),
  createMockRevision({
    id: 1,
    description: "created this.",
    timestamp: "2024-01-01T10:00:00Z",
    is_creation: true,
    user: {
      id: mockUser.id,
      first_name: mockUser.first_name ?? "",
      last_name: mockUser.last_name ?? "",
      common_name: mockUser.common_name ?? "",
    },
  }),
];

const mockDocument = createMockDocument({
  id: 1,
  name: "Test Document",
  can_write: true,
  archived: false,
});

function setup({
  document = mockDocument,
  revisions = mockRevisions,
}: {
  document?: Document;
  revisions?: Revision[];
} = {}) {
  const onClose = jest.fn();
  const currentUser = mockUser;

  setupDocumentRevisionsEndpoint(document.id, revisions);
  setupUsersEndpoints([currentUser]);

  const state = createMockState({
    currentUser,
  });

  renderWithProviders(
    <DocumentRevisionHistorySidebar document={document} onClose={onClose} />,
    { storeInitialState: state },
  );

  return { onClose, document };
}

describe("DocumentRevisionHistorySidebar", () => {
  it("should render the sidebar when open", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByTestId("document-history-list")).toBeInTheDocument();
  });

  it("should display revision history entries", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(await screen.findByText(/created this/)).toBeInTheDocument();
    expect(
      await screen.findByText(/renamed this Document/),
    ).toBeInTheDocument();
  });

  it("should show revert buttons when user can write", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    await screen.findByText(/created this/);
    await screen.findByText(/renamed this Document/);

    const revertButtons = screen.getAllByTestId("question-revert-button");
    expect(revertButtons).toHaveLength(1);
  });

  it("should not show revert buttons when user cannot write", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    const revertButtons = screen.queryAllByRole("button", { name: "Revert" });
    expect(revertButtons).toHaveLength(0);
  });

  it("should not show revert buttons when document is archived", async () => {
    setup({
      document: createMockDocument({
        id: 1,
        name: "Test Document",
        can_write: true,
        archived: true,
      }),
    });

    await waitForLoaderToBeRemoved();

    const revertButtons = screen.queryAllByRole("button", { name: "Revert" });
    expect(revertButtons).toHaveLength(0);
  });

  it("should handle empty revisions", async () => {
    setup({ revisions: [] });

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("document-history-list")).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", async () => {
    const { onClose } = setup();

    await waitForLoaderToBeRemoved();

    const closeButton = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
