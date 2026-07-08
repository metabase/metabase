import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupRemoteSyncCancelTaskEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { RemoteSyncOutcome } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { SyncProgressModal } from "./SyncProgressModal";

const setup = ({
  taskType = "import" as const,
  progress = 0.5,
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
