import fetchMock from "fetch-mock";

import {
  setupStartUsageMetadataRefreshEndpoint,
  setupUsageMetadataRefreshEndpoint,
} from "__support__/server-mocks";
import { act, renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { UsageMetadataRunState } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { useCleanupRefresh } from "./useCleanupRefresh";

const REFRESH_URL = "path:/api/ee/data-studio/usage-metadata/refresh";
// matches the hook's own polling cadence; hardcoded rather than imported so this
// test still exercises the real interval when run against a pre-fix revision
const POLLING_INTERVAL_MS = 3000;

function countRefreshGetCalls() {
  return fetchMock.callHistory.calls(REFRESH_URL, { method: "GET" }).length;
}

function setup() {
  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
  });

  return renderHookWithProviders(() => useCleanupRefresh(), {
    storeInitialState,
  });
}

describe("useCleanupRefresh", () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not poll forever when start() resolves with active still null (409 race)", async () => {
    setupUsageMetadataRefreshEndpoint({
      snapshot: null,
      active: null,
      failure: null,
    });
    setupStartUsageMetadataRefreshEndpoint({ status: 409 });

    const { result } = setup();

    await waitFor(() => expect(result.current.status).not.toBeUndefined());
    const callsBeforeStart = countRefreshGetCalls();

    await act(() => result.current.start());

    expect(result.current.isRefreshing).toBe(false);

    const callsAfterStart = countRefreshGetCalls();
    await act(async () => {
      jest.advanceTimersByTime(POLLING_INTERVAL_MS * 3);
    });

    // only the immediate post-start refetch, no runaway polling on top of it
    expect(countRefreshGetCalls()).toBe(callsAfterStart);
    expect(callsAfterStart).toBeGreaterThan(callsBeforeStart);
  });

  it("keeps polling while a refresh is active, and stops once it finishes", async () => {
    let active: UsageMetadataRunState | null = { id: 1, status: "running" };
    fetchMock.get(REFRESH_URL, () => ({
      snapshot: null,
      active,
      failure: null,
    }));
    setupStartUsageMetadataRefreshEndpoint({ run_id: 1 });

    const { result } = setup();

    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    const callsWhileActive = countRefreshGetCalls();

    act(() => {
      jest.advanceTimersByTime(POLLING_INTERVAL_MS);
    });
    await waitFor(() =>
      expect(countRefreshGetCalls()).toBeGreaterThan(callsWhileActive),
    );

    active = null;
    act(() => {
      jest.advanceTimersByTime(POLLING_INTERVAL_MS);
    });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false));

    const callsOnceInactive = countRefreshGetCalls();
    await act(async () => {
      jest.advanceTimersByTime(POLLING_INTERVAL_MS * 3);
    });
    expect(countRefreshGetCalls()).toBe(callsOnceInactive);
  });
});
