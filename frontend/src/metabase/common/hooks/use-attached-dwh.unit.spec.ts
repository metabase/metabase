import fetchMock from "fetch-mock";

import { setupDatabaseListEndpoint } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockDatabase, createMockUser } from "metabase-types/api/mocks";

import { useAttachedDwh } from "./use-attached-dwh";

function setup({
  hasAttachedDwhDatabase = true,
  isAdmin = false,
}: {
  hasAttachedDwhDatabase?: boolean;
  isAdmin?: boolean;
} = {}) {
  setupDatabaseListEndpoint(
    hasAttachedDwhDatabase
      ? [createMockDatabase({ id: 1, is_attached_dwh: true })]
      : [],
  );

  return renderHookWithProviders(() => useAttachedDwh(), {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

describe("useAttachedDwh", () => {
  it("reports storage for a non-admin", async () => {
    // This used to come from a query skipped for anyone who couldn't buy
    // storage, so non-admins saw an instance with storage as one without.
    const { result } = setup({ isAdmin: false });

    await waitFor(() => {
      expect(result.current.hasAttachedDwh).toBe(true);
    });
  });

  it("reports no storage when the databases list has no attached DWH", async () => {
    const { result } = setup({ hasAttachedDwhDatabase: false });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/database")).toBe(true);
    });
    expect(result.current.hasAttachedDwh).toBe(false);
  });
});
