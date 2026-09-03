import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { RemoteSyncDependencyErrorResponse } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

import { COLLECTIONS_KEY, TYPE_KEY, URL_KEY } from "../constants";

import { useRemoteSyncSubmit } from "./use-remote-sync-submit";

const UNSYNCED_DEPENDENCIES_BODY: RemoteSyncDependencyErrorResponse = {
  error: "Uses content that is not remote synced.",
  error_code: "unsynced-dependencies",
  errors: {
    collections: [
      {
        collection: { id: 14, name: "New Collection" },
        dependencies: [
          {
            model: "card",
            id: 416,
            name: "Subscription seats over time",
            collection: { id: 7, name: "Regular" },
            remedy: {
              type: "collection",
              collection: {
                id: 7,
                name: "Regular",
                type: null,
                personal: false,
              },
            },
            used_by: [],
          },
        ],
      },
    ],
  },
};

const setup = () => {
  setupPropertiesEndpoints(createMockSettings());
  fetchMock.put("path:/api/ee/remote-sync/settings", {
    status: 400,
    body: UNSYNCED_DEPENDENCIES_BODY,
  });

  return renderHookWithProviders(
    () =>
      useRemoteSyncSubmit({
        initialValues: { [COLLECTIONS_KEY]: {} },
        variant: "admin",
      }),
    {},
  );
};

describe("useRemoteSyncSubmit", () => {
  it("surfaces the unsynced-dependencies payload from a rejected save", async () => {
    const { result } = setup();

    expect(result.current.unsyncedDependenciesError).toBeUndefined();

    await result.current
      .handleSubmit({
        [TYPE_KEY]: "read-write",
        [URL_KEY]: "https://github.com/test/repo.git",
        [COLLECTIONS_KEY]: { 14: true },
      })
      .catch(() => undefined);

    await waitFor(() => {
      expect(result.current.unsyncedDependenciesError).toEqual(
        UNSYNCED_DEPENDENCIES_BODY,
      );
    });
  });
});
