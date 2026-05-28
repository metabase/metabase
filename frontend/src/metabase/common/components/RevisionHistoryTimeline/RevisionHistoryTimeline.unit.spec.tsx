import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RevisionOrModerationEvent } from "metabase/plugins";
import { createMockRevision } from "metabase-types/api/mocks/revision";

import { RevisionHistoryTimeline } from "./RevisionHistoryTimeline";

const events: RevisionOrModerationEvent[] = [
  {
    title: "edited this",
    timestamp: "2026-05-15T10:00:00Z",
    icon: "pencil",
    revision: createMockRevision({ id: 2 }),
  },
  {
    title: "created this",
    timestamp: "2026-05-14T10:00:00Z",
    icon: "pencil",
    revision: createMockRevision({ id: 1 }),
  },
];

function setup({
  revert,
}: {
  revert: (revision: unknown) => Promise<unknown>;
}) {
  return renderWithProviders(
    <RevisionHistoryTimeline
      entity="card"
      events={events}
      revert={revert}
      canWrite
      data-testid="history-list"
    />,
  );
}

describe("RevisionHistoryTimeline", () => {
  it("shows an error toast with the backend-provided message when revert fails", async () => {
    const revert = jest.fn().mockRejectedValue({
      data: { message: "Cannot revert: missing card" },
    });

    const { store } = setup({ revert });

    await userEvent.click(
      (await screen.findAllByTestId("question-revert-button"))[0],
    );

    await waitFor(() => {
      expect(store.getState().undo).toHaveLength(1);
    });
    expect(store.getState().undo[0]).toMatchObject({
      toastColor: "error",
      icon: "warning",
      message: "Cannot revert: missing card",
    });
  });

  it("falls back to a generic message when the error has no message", async () => {
    const revert = jest.fn().mockRejectedValue({});

    const { store } = setup({ revert });

    await userEvent.click(
      (await screen.findAllByTestId("question-revert-button"))[0],
    );

    await waitFor(() => {
      expect(store.getState().undo).toHaveLength(1);
    });
    expect(store.getState().undo[0]).toMatchObject({
      toastColor: "error",
      icon: "warning",
      message: "Failed to revert to previous version.",
    });
  });

  it("does not show a toast when revert succeeds", async () => {
    const revert = jest.fn().mockResolvedValue(undefined);

    const { store } = setup({ revert });

    await userEvent.click(
      (await screen.findAllByTestId("question-revert-button"))[0],
    );

    await waitFor(() => {
      expect(revert).toHaveBeenCalled();
    });
    expect(store.getState().undo).toHaveLength(0);
  });
});
