import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupPropertiesEndpoints,
  setupRemoteSyncDirtyEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { RemoteSyncEntity } from "metabase-types/api";
import {
  createMockRemoteSyncEntity,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { useHasGlossaryDirtyChanges } from "./use-has-glossary-dirty-changes";

interface SetupOptions {
  isGitSyncVisible?: boolean;
  dirty?: RemoteSyncEntity[];
}

const setup = ({ isGitSyncVisible = true, dirty = [] }: SetupOptions = {}) => {
  setupEnterprisePlugins();

  const tokenFeatures = createMockTokenFeatures({ library: true });
  const settingsValues = {
    "remote-sync-enabled": isGitSyncVisible,
    "remote-sync-branch": isGitSyncVisible ? "main" : null,
    "remote-sync-type": "read-write" as const,
    "token-features": tokenFeatures,
  };

  setupPropertiesEndpoints(createMockSettings(settingsValues));
  setupSettingsEndpoints([]);
  setupRemoteSyncDirtyEndpoint({ dirty, changedCollections: {} });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings(settingsValues),
  });

  return renderHookWithProviders(() => useHasGlossaryDirtyChanges(), {
    storeInitialState,
  });
};

const glossaryEntity = createMockRemoteSyncEntity({
  id: 10,
  name: "ARR",
  model: "glossary",
  sync_status: "create",
});

describe("useHasGlossaryDirtyChanges", () => {
  it("returns false when no dirty changes exist", async () => {
    const { result } = setup({ dirty: [] });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns true when a glossary entry is dirty", async () => {
    const { result } = setup({ dirty: [glossaryEntity] });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });
  });

  it("returns false when only non-glossary entities are dirty", async () => {
    const { result } = setup({
      dirty: [createMockRemoteSyncEntity({ model: "card", collection_id: 1 })],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it("returns false when git sync is not visible", async () => {
    const { result } = setup({
      isGitSyncVisible: false,
      dirty: [glossaryEntity],
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });
});
