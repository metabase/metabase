import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RemoteSyncTask } from "metabase-types/api";
import {
  createMockRemoteSyncPulledOutcome,
  createMockRemoteSyncTask,
} from "metabase-types/api/mocks";

import { SyncTaskModal } from "./SyncTaskModal";

type SetupOpts = {
  task: RemoteSyncTask;
  taskId?: number;
};

const setup = ({ task, taskId = 1 }: SetupOpts) => {
  const onClose = jest.fn<void, []>();
  setupRemoteSyncEndpoints({ currentTask: task });
  renderWithProviders(
    <SyncTaskModal title="Pulling changes" taskId={taskId} onClose={onClose} />,
  );
  return { onClose };
};

describe("SyncTaskModal", () => {
  it("shows progress of running tasks, which can be cancelled", async () => {
    const { onClose } = setup({
      task: createMockRemoteSyncTask({ id: 1, progress: 0.5 }),
    });

    expect(screen.getByText("Pulling changes")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "50",
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/remote-sync/current-task/cancel",
      ),
    ).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when task succeeds", async () => {
    const { onClose } = setup({
      task: createMockRemoteSyncTask({
        id: 1,
        status: "successful",
        outcome: createMockRemoteSyncPulledOutcome({ count: 2 }),
      }),
    });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows why task failed", async () => {
    const { onClose } = setup({
      task: createMockRemoteSyncTask({
        id: 1,
        status: "errored",
        error_message: "Repository not found",
      }),
    });

    expect(await screen.findByText("Repository not found")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists what collided when conflicts stop task", async () => {
    setup({
      task: createMockRemoteSyncTask({
        id: 1,
        status: "conflict",
        conflicts: ["Orders by month"],
      }),
    });

    expect(
      await screen.findByText(
        "The same content was changed here and on the branch.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Orders by month")).toBeInTheDocument();
  });

  it("waits for its own task", async () => {
    const { onClose } = setup({
      task: createMockRemoteSyncTask({ id: 2, status: "successful" }),
    });

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/current-task"),
      ).toBe(true),
    );
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
