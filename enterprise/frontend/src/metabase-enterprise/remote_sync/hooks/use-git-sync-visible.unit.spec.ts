import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockSettings, createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useGitSyncVisible } from "./use-git-sync-visible";

const setup = ({
  isAdmin = true,
  remoteSyncEnabled = true,
  currentBranch = "main",
  syncType = "read-write",
}: {
  isAdmin?: boolean;
  remoteSyncEnabled?: boolean;
  currentBranch?: string | null;
  syncType?: "read-only" | "read-write";
} = {}) => {
  setupPropertiesEndpoints(
    createMockSettings({
      "remote-sync-enabled": remoteSyncEnabled,
      "remote-sync-branch": currentBranch,
      "remote-sync-type": syncType,
    }),
  );
  setupSettingsEndpoints([]);

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: isAdmin }),
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
});
