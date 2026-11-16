import fetchMock from "fetch-mock";

import { setupRemoteSyncEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { RemoteSyncChangesTarget } from "metabase/plugins";
import type { RemoteSyncDirtyItem, RemoteSyncType } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncCardData,
  createMockRemoteSyncDirtyItem,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { ChangesBadge } from "./ChangesBadge";

type SetupOpts = {
  target: RemoteSyncChangesTarget;
  dirty?: RemoteSyncDirtyItem[];
  isAdmin?: boolean;
  syncType?: RemoteSyncType;
};

function setup({
  target,
  dirty = [],
  isAdmin = true,
  syncType = "read-write",
}: SetupOpts) {
  setupRemoteSyncEndpoints({ dirty });

  renderWithProviders(<ChangesBadge target={target} />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
      settings: mockSettings(
        createMockSettings({
          "remote-sync-enabled": true,
          "remote-sync-branch": "main",
          "remote-sync-type": syncType,
        }),
      ),
    }),
  });
}

describe("ChangesBadge", () => {
  it("shows badge when target has unpushed changes", async () => {
    setup({
      target: { type: "collection", id: 1 },
      dirty: [
        createMockRemoteSyncDirtyItem({
          model: "card",
          data: createMockRemoteSyncCardData({
            collection_id: 1,
            collection: createMockCollection({ id: 1 }),
          }),
        }),
      ],
    });

    expect(await screen.findByTestId("remote-sync-status")).toBeInTheDocument();
  });

  it("shows no badge when target has no unpushed changes", async () => {
    setup({
      target: { type: "collection", id: 1 },
      dirty: [
        createMockRemoteSyncDirtyItem({
          model: "card",
          data: createMockRemoteSyncCardData({
            collection_id: 2,
            collection: createMockCollection({ id: 2 }),
          }),
        }),
      ],
    });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/remote-sync/dirty"),
      ).toBe(true);
    });
    expect(screen.queryByTestId("remote-sync-status")).not.toBeInTheDocument();
  });

  it.each([
    { name: "non-admins", isAdmin: false, syncType: "read-write" as const },
    {
      name: "read-only instances",
      isAdmin: true,
      syncType: "read-only" as const,
    },
  ])("fetches nothing for $name", async ({ isAdmin, syncType }) => {
    setup({
      target: { type: "collection", id: 1 },
      dirty: [
        createMockRemoteSyncDirtyItem({
          model: "card",
          data: createMockRemoteSyncCardData({
            collection_id: 1,
            collection: createMockCollection({ id: 1 }),
          }),
        }),
      ],
      isAdmin,
      syncType,
    });

    expect(screen.queryByTestId("remote-sync-status")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called("path:/api/ee/remote-sync/dirty")).toBe(
      false,
    );
  });
});
