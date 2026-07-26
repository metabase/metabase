import {
  setupPropertiesEndpoints,
  setupRemoteSyncWorktreeEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import {
  createMockRemoteSyncWorktree,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { useGitSyncVisible } from "./use-git-sync-visible";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
  isBranchEnvSetting = false,
  worktreeId = null,
  worktree,
  worktreeDelay = 0,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
  isBranchEnvSetting?: boolean;
  worktreeId?: number | null;
  worktree?: ReturnType<typeof createMockRemoteSyncWorktree>;
  worktreeDelay?: number;
} = {}) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  );
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "remote-sync-branch",
      value: currentBranch,
      is_env_setting: isBranchEnvSetting,
      env_name: "MB_REMOTE_SYNC_BRANCH",
    }),
  ]);

  if (typeof worktreeId === "number") {
    setupRemoteSyncWorktreeEndpoint(
      worktreeId,
      worktree ?? createMockRemoteSyncWorktree({ id: worktreeId }),
      { delay: worktreeDelay },
    );
  }

  const storeInitialState = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      worktree_id: worktreeId,
    }),
    settings: mockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  });

  return renderHookWithProviders(() => useGitSyncVisible(), {
    storeInitialState,
  });
};

describe("useGitSyncVisible", () => {
  it("should return isVisible: true when all conditions are met", async () => {
    const { result } = setup({
      isAdmin: true,
      remoteSyncEnabled: true,
      currentBranch: "main",
      syncType: "read-write",
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(true);
    });
    expect(result.current.currentBranch).toBe("main");
  });

  it("should return isVisible: false when remote sync is disabled", async () => {
    const { result } = setup({
      remoteSyncEnabled: false,
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("should return isVisible: false when user is not admin", async () => {
    const { result } = setup({
      isAdmin: false,
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("should return isVisible: false when currentBranch is null", async () => {
    const { result } = setup({
      currentBranch: null,
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });
    expect(result.current.currentBranch).toBe(null);
  });

  it("should return isVisible: false when sync type is read-only", async () => {
    const { result } = setup({
      syncType: "read-only",
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("should return isVisible: false when multiple conditions fail", async () => {
    const { result } = setup({
      isAdmin: false,
      remoteSyncEnabled: false,
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(false);
    });
  });

  it("should return isBranchSetByEnv: true when branch is set by environment variable", async () => {
    const { result } = setup({
      isBranchEnvSetting: true,
    });

    await waitFor(() => {
      expect(result.current.isBranchSetByEnv).toBe(true);
    });
  });

  it("should return isBranchSetByEnv: false when branch is not set by environment variable", async () => {
    const { result } = setup({
      isBranchEnvSetting: false,
    });

    await waitFor(() => {
      expect(result.current.isBranchSetByEnv).toBe(false);
    });
  });

  describe("worktree", () => {
    it("should return isWorktree: false and the git branch when the user has no worktree", async () => {
      const { result } = setup({ currentBranch: "main" });

      await waitFor(() => {
        expect(result.current.isVisible).toBe(true);
      });
      expect(result.current.isWorktree).toBe(false);
      expect(result.current.currentBranch).toBe("main");
    });

    it("should return isVisible: false while the worktree branch is loading", async () => {
      const { result } = setup({
        currentBranch: "main",
        worktreeId: 42,
        worktreeDelay: 50,
      });

      expect(result.current.isVisible).toBe(false);
      expect(result.current.currentBranch).toBeFalsy();
    });

    it("should return isWorktree: true and the worktree's branch once loaded", async () => {
      const { result } = setup({
        currentBranch: "main",
        worktreeId: 42,
        worktree: createMockRemoteSyncWorktree({
          id: 42,
          branch: "feature/my-worktree",
        }),
      });

      await waitFor(() => {
        expect(result.current.currentBranch).toBe("feature/my-worktree");
      });
      expect(result.current.isWorktree).toBe(true);
      expect(result.current.isVisible).toBe(true);
    });
  });
});
