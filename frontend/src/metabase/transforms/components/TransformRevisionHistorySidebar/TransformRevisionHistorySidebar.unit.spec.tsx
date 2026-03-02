import userEvent from "@testing-library/user-event";

import {
  setupTransformRevisionsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { Revision, Transform } from "metabase-types/api";
import {
  createMockRevision,
  createMockTransform,
  createMockUser,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TransformRevisionHistorySidebar } from "./TransformRevisionHistorySidebar";

const mockUser = createMockUser();

const mockRevisions: Revision[] = [
  createMockRevision({
    id: 2,
    description: 'renamed this Transform from "Old Name" to "Test Transform".',
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

const mockTransform = createMockTransform({
  id: 1,
  name: "Test Transform",
});

function setup({
  transform = mockTransform,
  revisions = mockRevisions,
}: {
  transform?: Transform;
  revisions?: Revision[];
} = {}) {
  const onClose = jest.fn();
  const currentUser = mockUser;

  setupTransformRevisionsEndpoint(transform.id, revisions);
  setupUsersEndpoints([currentUser]);

  const state = createMockState({
    currentUser,
  });

  renderWithProviders(
    <TransformRevisionHistorySidebar transform={transform} onClose={onClose} />,
    { storeInitialState: state },
  );

  return { onClose, transform };
}

describe("TransformRevisionHistorySidebar", () => {
  it("should render the sidebar when open", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(await screen.findByText("History")).toBeInTheDocument();
    expect(
      await screen.findByTestId("transform-history-list"),
    ).toBeInTheDocument();
  });

  it("should display revision history entries", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    expect(await screen.findByText(/created this/)).toBeInTheDocument();
    expect(
      await screen.findByText(/renamed this Transform/),
    ).toBeInTheDocument();
  });

  it("should show revert buttons", async () => {
    setup();

    await waitForLoaderToBeRemoved();

    await screen.findByText(/created this/);
    await screen.findByText(/renamed this Transform/);

    const revertButtons = screen.getAllByTestId("question-revert-button");
    expect(revertButtons).toHaveLength(1);
  });

  it("should handle empty revisions", async () => {
    setup({ revisions: [] });

    await waitForLoaderToBeRemoved();

    expect(
      await screen.findByTestId("transform-history-list"),
    ).toBeInTheDocument();
  });

  it("should call onClose when close button is clicked", async () => {
    const { onClose } = setup();

    await waitForLoaderToBeRemoved();
    await screen.findByText("History");

    const closeButton = screen.getByRole("button", { name: /close/i });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
