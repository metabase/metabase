import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupRemoteSyncCancelTaskEndpoint,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RemoteSyncOutcome, RemoteSyncTaskUser } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { SyncProgressModal } from "./SyncProgressModal";

const STARTED_AT = "2026-09-15T22:06:23Z";
const STARTED_AT_TIME = new Date(STARTED_AT).toLocaleTimeString([], {
  hour: "numeric",
  minute: "2-digit",
});

const INITIATED_BY_USER: RemoteSyncTaskUser = {
  id: 231,
  first_name: "Cynthia",
  last_name: "Balusek",
  email: "cynthia@example.com",
};

const setup = ({
  taskType = "import" as const,
  progress = 0.5,
  isStalled = false,
  isQuiet = false,
  isCancelled = false,
  minutesSinceLastUpdate = null,
  startedAt = null,
  initiatedByUser = null,
  isError = false,
  errorMessage = "",
  isSuccess = false,
  outcome = null,
  isAdmin = true,
  onDismiss = jest.fn(),
  cancelResponse,
}: {
  taskType?: "import" | "export";
  progress?: number;
  isStalled?: boolean;
  isQuiet?: boolean;
  isCancelled?: boolean;
  minutesSinceLastUpdate?: number | null;
  startedAt?: string | null;
  initiatedByUser?: RemoteSyncTaskUser | null;
  isError?: boolean;
  errorMessage?: string;
  isSuccess?: boolean;
  outcome?: RemoteSyncOutcome | null;
  isAdmin?: boolean;
  onDismiss?: jest.Mock;
  cancelResponse?: { status?: number; body?: any; delay?: number };
} = {}) => {
  if (cancelResponse) {
    setupRemoteSyncCancelTaskEndpoint(cancelResponse);
  }

  return {
    onDismiss,
    ...renderWithProviders(
      <SyncProgressModal
        taskType={taskType}
        progress={progress}
        isStalled={isStalled}
        isQuiet={isQuiet}
        isCancelled={isCancelled}
        minutesSinceLastUpdate={minutesSinceLastUpdate}
        startedAt={startedAt}
        initiatedByUser={initiatedByUser}
        isError={isError}
        errorMessage={errorMessage}
        isSuccess={isSuccess}
        outcome={outcome}
        onDismiss={onDismiss}
      />,
      {
        storeInitialState: createMockState({
          currentUser: createMockUser({ is_superuser: isAdmin }),
        }),
      },
    ),
  };
};

describe("SyncProgressModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("progress state", () => {
    it("should show import progress modal for import task", () => {
      setup({ taskType: "import" });

      expect(screen.getByText("Pulling from Git")).toBeInTheDocument();
      expect(screen.getByText("Importing content…")).toBeInTheDocument();
    });

    it("should show export progress modal for export task", () => {
      setup({ taskType: "export" });

      expect(screen.getByText("Pushing to Git")).toBeInTheDocument();
      expect(screen.getByText("Exporting content…")).toBeInTheDocument();
    });

    it("should show progress bar with correct value", () => {
      setup({ progress: 0.75 });

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "75");
    });

    it("should show cancel button when user is admin", () => {
      setup({ isAdmin: true, cancelResponse: { status: 200 } });

      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("should not show cancel button when user is not admin", () => {
      setup({ isAdmin: false });

      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("quiet running state", () => {
    it("keeps the progress bar and says the sync is still running when progress has not moved", () => {
      setup({
        taskType: "export",
        progress: 0.3,
        isQuiet: true,
        minutesSinceLastUpdate: 6,
      });

      expect(
        screen.getByText(
          "No progress for 6 minutes. The sync is still running.",
        ),
      ).toBeInTheDocument();
      expect(screen.getByRole("progressbar")).toBeInTheDocument();
      expect(screen.getByText("Exporting content…")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("uses the singular 'minute' when only one minute has passed", () => {
      setup({ isQuiet: true, minutesSinceLastUpdate: 1 });

      expect(
        screen.getByText(
          "No progress for 1 minute. The sync is still running.",
        ),
      ).toBeInTheDocument();
    });

    it("shows no hint while progress is fresh", () => {
      setup({ isQuiet: false, minutesSinceLastUpdate: 0 });

      expect(screen.queryByText(/still running/)).not.toBeInTheDocument();
    });
  });

  describe("interrupted state", () => {
    it("explains that the server stopped responding and how far the pull got", () => {
      setup({
        taskType: "import",
        progress: 0.32,
        isStalled: true,
        minutesSinceLastUpdate: 13,
      });

      expect(screen.getByText("Sync interrupted")).toBeInTheDocument();
      expect(
        screen.getByText(
          "The server stopped responding 13 minutes ago. It may have restarted. Content pulled before the interruption was kept. Pull again to finish.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Stopped at 32% while importing content"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.queryByText(/Please wait/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Still working/)).not.toBeInTheDocument();
    });

    it("tells an interrupted push to retry rather than claiming partial content", () => {
      setup({
        taskType: "export",
        progress: 0.5,
        isStalled: true,
        minutesSinceLastUpdate: 1,
      });

      expect(
        screen.getByText(
          "The server stopped responding 1 minute ago. It may have restarted. Push again to retry.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Stopped at 50% while exporting content"),
      ).toBeInTheDocument();
    });

    it("closes with onDismiss without touching the task", async () => {
      const onDismiss = jest.fn();
      setup({ isStalled: true, onDismiss, cancelResponse: { status: 200 } });

      await userEvent.click(
        screen.getByTestId("sync-interrupted-close-button"),
      );

      expect(onDismiss).toHaveBeenCalled();
      expect(await findRequests("POST")).toHaveLength(0);
    });

    it("lets an admin clear the task, which cancels it and then dismisses", async () => {
      const onDismiss = jest.fn();
      setup({ isStalled: true, onDismiss, cancelResponse: { status: 200 } });

      await userEvent.click(screen.getByRole("button", { name: "Clear task" }));

      await waitFor(async () => {
        const requests = await findRequests("POST");
        expect(
          requests.some((r) =>
            r.url.includes("/api/ee/remote-sync/current-task/cancel"),
          ),
        ).toBe(true);
      });
      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled();
      });
    });

    it("offers no clear action to a non-admin", () => {
      setup({ isStalled: true, isAdmin: false });

      expect(
        screen.queryByRole("button", { name: "Clear task" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("sync-interrupted-close-button"),
      ).toBeInTheDocument();
    });
  });

  describe("cancelled state", () => {
    it("shows the row's message with a Close button and no progress bar", async () => {
      const onDismiss = jest.fn();
      setup({
        taskType: "import",
        progress: 0.21,
        isCancelled: true,
        errorMessage:
          "Sync was interrupted: the server stopped responding for 5 minutes (it may have restarted)",
        onDismiss,
      });

      expect(screen.getByText("Sync stopped")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Sync was interrupted: the server stopped responding for 5 minutes (it may have restarted)",
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Stopped at 21% while importing content"),
      ).toBeInTheDocument();
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByTestId("sync-cancelled-close-button"));

      expect(onDismiss).toHaveBeenCalled();
    });

    it("falls back to generic copy when the row has no message", () => {
      setup({ isCancelled: true, errorMessage: "" });

      expect(screen.getByText("The sync was cancelled.")).toBeInTheDocument();
    });
  });

  describe("started-by line", () => {
    it("names the initiating user and the start time", () => {
      setup({
        isCancelled: true,
        startedAt: STARTED_AT,
        initiatedByUser: INITIATED_BY_USER,
      });

      expect(screen.getByTestId("sync-started-by")).toHaveTextContent(
        `Started by Cynthia Balusek at ${STARTED_AT_TIME}`,
      );
    });

    it("falls back to the email when the user has no name", () => {
      setup({
        isStalled: true,
        startedAt: STARTED_AT,
        initiatedByUser: {
          ...INITIATED_BY_USER,
          first_name: null,
          last_name: null,
        },
      });

      expect(screen.getByTestId("sync-started-by")).toHaveTextContent(
        `Started by cynthia@example.com at ${STARTED_AT_TIME}`,
      );
    });

    it("shows only the start time for a task with no initiating user", () => {
      setup({ isError: true, startedAt: STARTED_AT, initiatedByUser: null });

      expect(screen.getByTestId("sync-started-by")).toHaveTextContent(
        `Started at ${STARTED_AT_TIME}`,
      );
    });

    it("is shown on the running view so a second admin can see whose task it is", () => {
      setup({
        startedAt: STARTED_AT,
        initiatedByUser: INITIATED_BY_USER,
      });

      expect(screen.getByTestId("sync-started-by")).toHaveTextContent(
        "Started by Cynthia Balusek",
      );
    });

    it("is omitted when the start time is unknown", () => {
      setup({ isCancelled: true, startedAt: null });

      expect(screen.queryByTestId("sync-started-by")).not.toBeInTheDocument();
    });

    it("is omitted from the success view", () => {
      setup({
        isSuccess: true,
        startedAt: STARTED_AT,
        initiatedByUser: INITIATED_BY_USER,
      });

      expect(screen.queryByTestId("sync-started-by")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("should show error modal with message", () => {
      setup({ isError: true, errorMessage: "Connection timeout" });

      expect(screen.getByText("Sync failed")).toBeInTheDocument();
      expect(
        screen.getByText("An error occurred during sync."),
      ).toBeInTheDocument();
      expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    });

    it("should show close button in error state", () => {
      setup({ isError: true });

      expect(screen.getByText("Close")).toBeInTheDocument();
    });

    it("should call onDismiss when close button is clicked in error state", async () => {
      const onDismiss = jest.fn();
      setup({ isError: true, onDismiss });

      await userEvent.click(screen.getByTestId("sync-error-close-button"));

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe("success state", () => {
    it("should render the pulled outcome with count and branch", () => {
      setup({
        taskType: "import",
        isSuccess: true,
        outcome: { kind: "pulled", count: 12, branch: "main" },
      });

      expect(screen.getByText("Pull complete")).toBeInTheDocument();
      expect(
        screen.getByText("Successfully pulled 12 changes from main."),
      ).toBeInTheDocument();
    });

    it("should render the pushed outcome with count and branch", () => {
      setup({
        taskType: "export",
        isSuccess: true,
        outcome: { kind: "pushed", count: 3, branch: "main" },
      });

      expect(screen.getByText("Push complete")).toBeInTheDocument();
      expect(
        screen.getByText("Successfully pushed 3 changes to main."),
      ).toBeInTheDocument();
    });

    it("should render the merged outcome with both counts", () => {
      setup({
        taskType: "export",
        isSuccess: true,
        outcome: { kind: "merged", pulled: 1, pushed: 1, branch: "main" },
      });

      expect(
        screen.getByText(
          "Successfully pulled 1 changes and pushed 1 changes to main.",
        ),
      ).toBeInTheDocument();
    });

    it("should render the skipped outcomes", () => {
      setup({
        taskType: "import",
        isSuccess: true,
        outcome: { kind: "pull-skipped" },
      });
      expect(screen.getByText("Skipped pull: no changes.")).toBeInTheDocument();
    });

    it("should fall back to generic copy when there is no outcome", () => {
      setup({ taskType: "import", isSuccess: true, outcome: null });

      expect(
        screen.getByText("Successfully pulled changes."),
      ).toBeInTheDocument();
    });

    it("should fall back to task-type copy when the outcome shape is unrecognized", () => {
      // An unknown kind (e.g. from a newer/older server) must not render a broken message.
      setup({
        taskType: "export",
        isSuccess: true,
        // Unjustified type cast. FIXME
        outcome: { kind: "teleported" } as unknown as RemoteSyncOutcome,
      });

      expect(
        screen.getByText("Successfully pushed changes."),
      ).toBeInTheDocument();
    });

    it("should fall back to generic pull copy when a pulled outcome is missing fields", () => {
      setup({
        taskType: "import",
        isSuccess: true,
        // Unjustified type cast. FIXME
        outcome: { kind: "pulled" } as unknown as RemoteSyncOutcome,
      });

      expect(
        screen.getByText("Successfully pulled changes."),
      ).toBeInTheDocument();
    });

    it("should fall back to generic push copy when a pushed outcome is missing fields", () => {
      setup({
        taskType: "export",
        isSuccess: true,
        // Unjustified type cast. FIXME
        outcome: { kind: "pushed", count: 3 } as unknown as RemoteSyncOutcome,
      });

      expect(
        screen.getByText("Successfully pushed changes."),
      ).toBeInTheDocument();
    });

    it("should fall back to combined pull-and-push copy when a merged outcome is missing fields", () => {
      setup({
        taskType: "export",
        isSuccess: true,
        // Unjustified type cast. FIXME
        outcome: { kind: "merged", pulled: 1 } as unknown as RemoteSyncOutcome,
      });

      expect(
        screen.getByText("Successfully pulled and pushed changes."),
      ).toBeInTheDocument();
    });

    it("should not show a cancel button in the success state", () => {
      setup({ isSuccess: true, isAdmin: true });

      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });

    it("should call onDismiss when the close button is clicked", async () => {
      const onDismiss = jest.fn();
      setup({ isSuccess: true, onDismiss });

      await userEvent.click(screen.getByTestId("sync-success-close-button"));

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe("cancel functionality", () => {
    it("should call onDismiss when cancel succeeds", async () => {
      const onDismiss = jest.fn();
      setup({ isAdmin: true, onDismiss, cancelResponse: { status: 200 } });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(async () => {
        const requests = await findRequests("POST");
        expect(
          requests.some((r) =>
            r.url.includes("/api/ee/remote-sync/current-task/cancel"),
          ),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled();
      });
    });

    it("should show error toast when cancel fails", async () => {
      const onDismiss = jest.fn();
      setup({
        isAdmin: true,
        onDismiss,
        cancelResponse: { status: 500, body: "Server error" },
      });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(async () => {
        const requests = await findRequests("POST");
        expect(
          requests.some((r) =>
            r.url.includes("/api/ee/remote-sync/current-task/cancel"),
          ),
        ).toBe(true);
      });

      // onDismiss should NOT be called on error (unless it's "no active task")
      expect(onDismiss).not.toHaveBeenCalled();
    });

    it("should call onDismiss when cancel fails with 'no active task' message", async () => {
      const onDismiss = jest.fn();
      setup({
        isAdmin: true,
        onDismiss,
        cancelResponse: { status: 400, body: "No active task to cancel" },
      });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(async () => {
        const requests = await findRequests("POST");
        expect(
          requests.some((r) =>
            r.url.includes("/api/ee/remote-sync/current-task/cancel"),
          ),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled();
      });
    });

    it("should disable cancel button while cancel is in progress", async () => {
      setup({
        isAdmin: true,
        cancelResponse: { status: 200, delay: 100 },
      });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(await screen.findByText("Cancelling…")).toBeInTheDocument();
    });
  });
});
