import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupCollectionByIdEndpoint } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { skipToken, useGetCollectionQuery } from "metabase/api";
import { PLUGIN_CONTENT_STUDIO, reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import type { CollectionId } from "metabase-types/api";
import {
  createMockCollection,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const MAIN_COLLECTION = createMockCollection({ id: 10, name: "Analytics" });

const BRANCH_COLLECTION = createMockCollection({
  id: 11,
  name: "Analytics",
  worktree_id: 5,
});

/**
 * Pairs the target with the state of the collection request it rests on, so a
 * test can tell "not locked" apart from "not loaded yet".
 */
function useSaveTargetWithLoadState(collectionId: CollectionId | null) {
  const targetCollectionId =
    PLUGIN_CONTENT_STUDIO.useSaveTargetCollectionId(collectionId);
  const { isSuccess } = useGetCollectionQuery(
    collectionId == null ? skipToken : { id: collectionId },
  );

  return { targetCollectionId, isCollectionLoaded: isSuccess };
}

function setup(collectionId: CollectionId | null) {
  setupCollectionByIdEndpoint({
    collections: [MAIN_COLLECTION, BRANCH_COLLECTION],
  });

  const storeInitialState = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "remote-sync-enabled": true,
      "token-features": createMockTokenFeatures({ remote_sync: true }),
    }),
  });

  setupEnterpriseOnlyPlugin("content_studio");

  return renderHookWithProviders(
    () => useSaveTargetWithLoadState(collectionId),
    {
      storeInitialState,
    },
  );
}

describe("useSaveTargetCollectionId", () => {
  afterEach(() => {
    reinitialize();
  });

  it("locks the save onto a collection checked out on a branch", async () => {
    const { result } = setup(BRANCH_COLLECTION.id);

    await waitFor(() =>
      expect(result.current.targetCollectionId).toBe(BRANCH_COLLECTION.id),
    );
  });

  it("leaves the picker open for a collection on the main branch", async () => {
    const { result } = setup(MAIN_COLLECTION.id);

    await waitFor(() => expect(result.current.isCollectionLoaded).toBe(true));
    expect(result.current.targetCollectionId).toBeUndefined();
  });

  it("asks for nothing when the question has no collection yet", async () => {
    const { result } = setup(null);

    await waitFor(() =>
      expect(fetchMock.callHistory.calls(/api\/collection/)).toHaveLength(0),
    );
    expect(result.current.targetCollectionId).toBeUndefined();
  });
});
