import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { RemoteSyncTask } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { useSyncStatus } from "./use-sync-status";

const CURRENT_TASK = "path:/api/ee/remote-sync/current-task";

const setup = ({
  task,
  enabled = true,
}: {
  task: Partial<RemoteSyncTask> | null;
  enabled?: boolean;
}) => {
  // the plugin registers its reducer and middleware only once the premium gate passes
  const settings = mockSettings({
    "token-features": createMockTokenFeatures({ remote_sync: true }),
    "remote-sync-enabled": enabled,
    "remote-sync-type": "read-write",
    "remote-sync-branch": "main",
  });
  setupEnterprisePlugins();
  fetchMock.get(CURRENT_TASK, task ? { status: 200, body: task } : 204);

  return renderHookWithProviders(() => useSyncStatus(), {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings,
    }),
  });
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

// The test store carries no plugin middleware, so these cover the subscription itself; what a fetched
// task does to the store is covered by the listener middleware spec.
describe("useSyncStatus", () => {
  it("fetches once and stays idle when there is no task", async () => {
    const { result } = setup({ task: null });

    await waitFor(() => {
      expect(fetchMock.callHistory.calls(CURRENT_TASK)).toHaveLength(1);
    });
    await settle();

    expect(fetchMock.callHistory.calls(CURRENT_TASK)).toHaveLength(1);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progressModal).toBeNull();
  });

  it("does not fetch when remote sync is disabled", async () => {
    setup({ task: null, enabled: false });
    await settle();

    expect(fetchMock.callHistory.calls(CURRENT_TASK)).toHaveLength(0);
  });
});
