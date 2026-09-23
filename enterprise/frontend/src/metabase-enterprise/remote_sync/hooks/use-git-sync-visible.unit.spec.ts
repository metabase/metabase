import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { Worktree } from "metabase-types/api";
import {
  createMockSettingDefinition,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { worktreeChanged } from "../sync-task-slice";

import { useGitSyncVisible } from "./use-git-sync-visible";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
  isBranchEnvSetting = false,
  worktree = null,
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
  isBranchEnvSetting?: boolean;
  worktree?: Worktree | null;
} = {}) => {
  if (worktree) {
    fetchMock.get(`path:/api/ee/remote-sync/worktree/${worktree.id}`, worktree);
  }
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

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ remote_sync: true }),
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  });

  // The worktree lives in the plugin's own slice, whose reducer only exists once the plugin is registered.
  setupEnterprisePlugins();

  const utils = renderHookWithProviders(() => useGitSyncVisible(), {
    storeInitialState,
  });

  if (worktree) {
    utils.store.dispatch(worktreeChanged(worktree.id));
  }

  return utils;
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

  it("should stay visible in read-only mode", async () => {
    const { result } = setup({
      syncType: "read-only",
    });

    await waitFor(() => {
      expect(result.current.isVisible).toBe(true);
    });
    expect(result.current.isReadWrite).toBe(false);
  });

  it("should return the worktree's branch when the user is working in one", async () => {
    const { result } = setup({
      currentBranch: "main",
      worktree: {
        id: 7,
        branch: "feature-branch",
        creator_id: null,
        created_at: "2026-09-23T00:00:00Z",
        updated_at: "2026-09-23T00:00:00Z",
      },
    });

    await waitFor(() => {
      expect(result.current.currentBranch).toBe("feature-branch");
    });
    expect(result.current.isInWorktree).toBe(true);
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
});
