import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { taskUpdated } from "../../sync-task-slice";

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
  hasRemoteChanges = true,
  hasRemoteChangesDelay = 0,
  hasRemoteChangesError = false,
  currentBranch = "main",
  syncType = "read-write",
  dirty = [],
  branches = ["main", "develop"],
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  hasRemoteChanges?: boolean;
  hasRemoteChangesDelay?: number;
  hasRemoteChangesError?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
  dirty?: ReturnType<typeof createMockDirtyEntity>[];
  branches?: string[];
} = {}) => {
  setupRemoteSyncEndpoints({
    branches,
    dirty,
    hasRemoteChanges,
    hasRemoteChangesDelay,
    hasRemoteChangesError,
  });
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

const findOption = (name: RegExp) => screen.findByRole("option", { name });
const getBranchButton = (name: RegExp) => screen.getByRole("button", { name });
const queryBranchButton = (name: RegExp) =>
  screen.queryByRole("button", { name });

describe("GitSyncControls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("visibility", () => {
    it("should not render when remote sync is disabled", async () => {
      setup({ remoteSyncEnabled: false });

      // Wait a tick to ensure component has rendered
      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when user is not admin", async () => {
      setup({ isAdmin: false });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when currentBranch is null", async () => {
      setup({ currentBranch: null });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should not render when sync type is read-only", async () => {
      setup({ syncType: "read-only" });

      await waitFor(() => {
        expect(queryBranchButton(/main/)).not.toBeInTheDocument();
      });
    });

    it("should render pill when all conditions are met", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
    });
  });

  describe("git sync button", () => {
    it("should display current branch name", async () => {
      setup({ currentBranch: "main" });
      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
    });

    it("should display different branch name", async () => {
      setup({ currentBranch: "develop" });
      await waitFor(() => {
        expect(getBranchButton(/develop/)).toBeInTheDocument();
      });

      expect(queryBranchButton(/main/)).not.toBeInTheDocument();
    });

    it("should open dropdown when clicked", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });

      await userEvent.click(getBranchButton(/main/));

      expect(await findOption(/Push changes/)).toBeInTheDocument();
      expect(await findOption(/Pull changes/)).toBeInTheDocument();
      expect(await findOption(/Switch branch/)).toBeInTheDocument();
    });
  });

  describe("push option", () => {
    it("should be enabled when there are changes", async () => {
      setup({ dirty: [createMockDirtyEntity()] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));

      expect(await findOption(/Push changes/)).toBeEnabled();
    });

    it("should be disabled and show proper tooltip when there are no changes", async () => {
      setup({ dirty: [] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Push changes/)).toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );

      await userEvent.hover(await findOption(/Push changes/));
      expect(
        await screen.findByRole("tooltip", { name: "No changes to push" }),
      ).toBeInTheDocument();
    });

    it("should open push modal when clicked with changes", async () => {
      setup({ dirty: [createMockDirtyEntity()] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Push changes/));

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
    });

    it("shows a refresh modal when the branch changed in another session", async () => {
      setup({ dirty: [createMockDirtyEntity()] });

      // Another session switched the branch since this tab loaded; the preflight CAS guard rejects.
      fetchMock.removeRoute("remote-sync-export-preflight");
      fetchMock.get(
        "path:/api/ee/remote-sync/export-preflight",
        {
          status: 409,
          body: {
            message:
              "The sync branch changed to 'develop' in another session. Refresh and try again.",
            branch_mismatch: true,
            current_branch: "develop",
          },
        },
        { name: "remote-sync-export-preflight" },
      );

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Push changes/));

      expect(
        await screen.findByText(/changed .* in another session/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Refresh/ }),
      ).toBeInTheDocument();
    });
  });

  describe("pull option", () => {
    it("should call import mutation when clicked", async () => {
      setup();

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Pull changes/));

      await waitFor(() => {
        expect(
          fetchMock.callHistory.done("path:/api/ee/remote-sync/import"),
        ).toBe(true);
      });
    });

    it("shows a refresh modal when a pull is rejected for a stale branch", async () => {
      setup();

      // Another session switched the branch; the import CAS guard rejects.
      fetchMock.removeRoute("remote-sync-import");
      fetchMock.post(
        "path:/api/ee/remote-sync/import",
        {
          status: 409,
          body: {
            message:
              "The sync branch changed to 'develop' in another session. Refresh and try again.",
            branch_mismatch: true,
            current_branch: "develop",
          },
        },
        { name: "remote-sync-import" },
      );

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      // Wait until the dirty state has settled (push disabled, since nothing is dirty) so the pull takes
      // the non-dirty direct-import path deterministically.
      await waitFor(async () => {
        expect(await findOption(/Push changes/)).toHaveAttribute(
          "data-combobox-disabled",
          "true",
        );
      });
      await userEvent.click(await findOption(/Pull changes/));

      expect(
        await screen.findByText(/changed .* in another session/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Refresh/ }),
      ).toBeInTheDocument();
    });

    it("toasts when the mergeability check fails on a dirty pull", async () => {
      // The toaster (UndoListing) isn't mounted in this harness, so assert the dispatched toast via the
      // undo store rather than the DOM.
      const { store } = setup({
        dirty: [createMockDirtyEntity()],
        hasRemoteChanges: true,
      });

      // The preflight fails for a non-branch-mismatch reason.
      fetchMock.removeRoute("remote-sync-export-preflight");
      fetchMock.get(
        "path:/api/ee/remote-sync/export-preflight",
        { status: 500, body: { message: "boom" } },
        { name: "remote-sync-export-preflight" },
      );

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      // Wait until the dirty state has settled (push enabled) so the pull takes the dirty/merge path.
      await waitFor(async () => {
        expect(await findOption(/Push changes/)).toBeEnabled();
      });
      await userEvent.click(await findOption(/Pull changes/));

      await waitFor(() => {
        const messages = store
          .getState()
          .undo.map((undo) => String(undo.message));
        expect(
          messages.some((m) =>
            /Couldn't check whether your changes can be merged/i.test(m),
          ),
        ).toBe(true);
      });
    });

    it("is enabled when there are changes to pull", async () => {
      setup({ hasRemoteChanges: true });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await waitFor(async () => {
        expect(await findOption(/Pull changes/)).not.toHaveAttribute(
          "data-combobox-disabled",
          "true",
        );
      });
    });

    it("is disabled when there are no changes to pull", async () => {
      setup({ hasRemoteChanges: false });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Pull changes/)).toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );
    });

    it("is disabled when pull changes are loading", async () => {
      jest.useFakeTimers({ advanceTimers: true });
      setup({ hasRemoteChanges: true, hasRemoteChangesDelay: 10000 });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      expect(await findOption(/Pull changes/)).toHaveAttribute(
        "data-combobox-disabled",
        "true",
      );
      expect(
        await within(await findOption(/Pull changes/)).findByTestId(
          "pull-changes-loader",
        ),
      ).toBeInTheDocument();
      jest.advanceTimersByTime(10000);
      jest.useRealTimers();
    });
  });

  describe("pull error handling", () => {
    it("shows error message when remote changes check fails", async () => {
      setup({ hasRemoteChangesError: true });

      await userEvent.click(await screen.findByTestId("git-sync-controls"));

      expect(
        await screen.findByText(
          "Failed to check for changes — check your authentication token",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("switch branch option", () => {
    it("should show branch dropdown when switch branch is clicked", async () => {
      setup({ branches: ["main", "develop", "feature-1"] });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Switch branch/));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Find or create a branch..."),
        ).toBeInTheDocument();
      });
    });

    it("shows a refresh modal when a clean branch switch is rejected for a stale branch", async () => {
      setup({ branches: ["main", "develop"] });

      // Another session already switched the branch; the import CAS guard rejects the switch.
      fetchMock.removeRoute("remote-sync-import");
      fetchMock.post(
        "path:/api/ee/remote-sync/import",
        {
          status: 409,
          body: {
            message:
              "The sync branch changed to 'develop' in another session. Refresh and try again.",
            branch_mismatch: true,
            current_branch: "develop",
          },
        },
        { name: "remote-sync-import" },
      );

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });
      await userEvent.click(getBranchButton(/main/));
      await userEvent.click(await findOption(/Switch branch/));
      await userEvent.click(await findOption(/develop/));

      expect(
        await screen.findByText(/changed .* in another session/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Refresh/ }),
      ).toBeInTheDocument();
    });
  });

  // Kept last: setupEnterprisePlugins() registers the remote-sync redux reducer globally, which the other
  // tests in this file deliberately don't need (they use local state). Doing it here keeps that contained.
  describe("export conflict toast", () => {
    it("toasts when an export task comes back in conflict", async () => {
      // The plugin reducer (state.plugins.remoteSyncPlugin, read by getCurrentTask) is only registered
      // when the remote_sync premium gate passes, so enable it and initialize the plugin.
      const settings = mockSettings({
        "token-features": createMockTokenFeatures({ remote_sync: true }),
        "remote-sync-enabled": true,
        "remote-sync-branch": "main",
        "remote-sync-type": "read-write",
      });
      setupEnterprisePlugins();
      setupRemoteSyncEndpoints({
        branches: ["main"],
        dirty: [],
        hasRemoteChanges: false,
      });
      setupCollectionEndpoints();
      setupSessionEndpoints({});

      const { store } = renderWithProviders(<GitSyncControls />, {
        storeInitialState: createMockState({
          currentUser: createMockUser({ is_superuser: true }),
          settings,
        }),
      });

      await waitFor(() => {
        expect(getBranchButton(/main/)).toBeInTheDocument();
      });

      // Simulate the polled export task coming back in conflict (what the middleware dispatches when a
      // push loses the preflight->execute race). GitSyncControls observes it and toasts via useToast.
      store.dispatch(
        taskUpdated({
          id: 77,
          sync_task_type: "export",
          status: "conflict",
          progress: 1,
          started_at: "2026-01-01T00:00:00Z",
          ended_at: "2026-01-01T00:00:01Z",
          last_progress_report_at: null,
          error_message: null,
          initiated_by: 0,
        }),
      );

      await waitFor(() => {
        const messages = store.getState().undo.map((u) => String(u.message));
        expect(messages.some((m) => /changed before your push/i.test(m))).toBe(
          true,
        );
      });
    });
  });
});
