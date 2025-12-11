import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { GitSyncControls } from "./GitSyncControls";
import {
  createMockDirtyEntity,
  createRemoteSyncStoreState,
  setupCollectionEndpoints,
  setupSessionEndpoints,
} from "./test-utils";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
  dirty = [],
  branches = ["main", "develop"],
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
  dirty?: ReturnType<typeof createMockDirtyEntity>[];
  branches?: string[];
} = {}) => {
  setupRemoteSyncEndpoints({ branches, dirty });
  setupCollectionEndpoints();
  setupSessionEndpoints({ remoteSyncEnabled, currentBranch, syncType });

  return renderWithProviders(<GitSyncControls />, {
    storeInitialState: createRemoteSyncStoreState({
      isAdmin,
      remoteSyncEnabled,
      currentBranch,
      syncType,
    }),
  });
};

describe("GitSyncControls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("visibility", () => {
    it("should not render when remote sync is disabled", async () => {
      setup({ remoteSyncEnabled: false });

      // Wait a tick to ensure component has rendered
      await waitFor(() => {
        expect(
          screen.queryByTestId("git-sync-controls"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not render when user is not admin", async () => {
      setup({ isAdmin: false });

      await waitFor(() => {
        expect(
          screen.queryByTestId("git-sync-controls"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not render when currentBranch is null", async () => {
      setup({ currentBranch: null });

      await waitFor(() => {
        expect(
          screen.queryByTestId("git-sync-controls"),
        ).not.toBeInTheDocument();
      });
    });

    it("should not render when sync type is read-only", async () => {
      setup({ syncType: "read-only" });

      await waitFor(() => {
        expect(
          screen.queryByTestId("git-sync-controls"),
        ).not.toBeInTheDocument();
      });
    });

    it("should render pill when all conditions are met", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
      });
    });
  });

  describe("branch picker integration", () => {
    it("should display current branch name", async () => {
      setup({ currentBranch: "main" });

      await waitFor(() => {
        expect(screen.getByTestId("branch-picker-button")).toBeInTheDocument();
      });
      expect(screen.getByText("main")).toBeInTheDocument();
    });

    it("should display different branch name", async () => {
      setup({ currentBranch: "develop" });

      await waitFor(() => {
        expect(screen.getByText("develop")).toBeInTheDocument();
      });
    });
  });

  describe("pull button", () => {
    it("should render pull button", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByTestId("git-pull-button")).toBeInTheDocument();
      });
    });

    it("should have correct aria-label", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Pull from Git")).toBeInTheDocument();
      });
    });

    it("should call import mutation when clicked", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByTestId("git-pull-button")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByTestId("git-pull-button"));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done("path:/api/ee/remote-sync/import"),
        ).toBe(true);
      });
    });
  });

  describe("push button", () => {
    it("should render push button", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeInTheDocument();
      });
    });

    it("should have correct aria-label", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByLabelText("Push to Git")).toBeInTheDocument();
      });
    });

    it("should be disabled when there are no changes", async () => {
      setup({ dirty: [] });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeDisabled();
      });
    });

    it("should be enabled when there are changes", async () => {
      setup({
        dirty: [createMockDirtyEntity()],
      });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeEnabled();
      });
    });

    it("should open push modal when clicked with changes", async () => {
      setup({
        dirty: [createMockDirtyEntity()],
      });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeEnabled();
      });

      await userEvent.click(screen.getByTestId("git-push-button"));

      await waitFor(() => {
        // The PushChangesModal should be rendered
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });
  });

  describe("pill structure", () => {
    it("should render all three sections (branch picker, pull, push)", async () => {
      setup();

      await waitFor(() => {
        expect(screen.getByTestId("git-sync-controls")).toBeInTheDocument();
      });
      expect(screen.getByTestId("branch-picker-button")).toBeInTheDocument();
      expect(screen.getByTestId("git-pull-button")).toBeInTheDocument();
      expect(screen.getByTestId("git-push-button")).toBeInTheDocument();
    });
  });

  describe("dirty state detection", () => {
    it("should detect dirty state with updated entity", async () => {
      setup({
        dirty: [createMockDirtyEntity({ sync_status: "update" })],
      });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeEnabled();
      });
    });

    it("should detect dirty state with created entity", async () => {
      setup({
        dirty: [createMockDirtyEntity({ sync_status: "create" })],
      });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeEnabled();
      });
    });

    it("should detect dirty state with deleted entity", async () => {
      setup({
        dirty: [createMockDirtyEntity({ sync_status: "delete" })],
      });

      await waitFor(() => {
        expect(screen.getByTestId("git-push-button")).toBeEnabled();
      });
    });
  });
});
