import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { SyncProgressModal } from "./SyncProgressModal";

const setupCancelEndpoint = (
  response: { status?: number; body?: any } = {},
) => {
  const { status = 200, body = {} } = response;

  if (status === 200) {
    fetchMock.post("path:/api/ee/remote-sync/current-task/cancel", body);
  } else {
    fetchMock.post("path:/api/ee/remote-sync/current-task/cancel", {
      status,
      body,
    });
  }
};

const setup = ({
  taskType = "import" as const,
  progress = 0.5,
  isError = false,
  errorMessage = "",
  isAdmin = true,
  onDismiss = jest.fn(),
  cancelResponse,
}: {
  taskType?: "import" | "export";
  progress?: number;
  isError?: boolean;
  errorMessage?: string;
  isAdmin?: boolean;
  onDismiss?: jest.Mock;
  cancelResponse?: { status?: number; body?: any };
} = {}) => {
  if (cancelResponse) {
    setupCancelEndpoint(cancelResponse);
  }

  return {
    onDismiss,
    ...renderWithProviders(
      <SyncProgressModal
        taskType={taskType}
        progress={progress}
        isError={isError}
        errorMessage={errorMessage}
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

  describe("cancel functionality", () => {
    it("should call onDismiss when cancel succeeds", async () => {
      const onDismiss = jest.fn();
      setup({ isAdmin: true, onDismiss, cancelResponse: { status: 200 } });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done(
            "path:/api/ee/remote-sync/current-task/cancel",
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

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done(
            "path:/api/ee/remote-sync/current-task/cancel",
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

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done(
            "path:/api/ee/remote-sync/current-task/cancel",
          ),
        ).toBe(true);
      });

      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled();
      });
    });

    it("should show 'Cancelling' state while cancel is in progress", async () => {
      // Create a delayed response to test the loading state
      fetchMock.post(
        "path:/api/ee/remote-sync/current-task/cancel",
        new Promise((resolve) => setTimeout(() => resolve({}), 100)),
      );

      setup({ isAdmin: true });

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await waitFor(() => {
        expect(screen.getByText("Cancelling")).toBeInTheDocument();
      });

      // Cancel button should be hidden while cancelling
      expect(
        screen.queryByRole("button", { name: "Cancel" }),
      ).not.toBeInTheDocument();
    });
  });
});
