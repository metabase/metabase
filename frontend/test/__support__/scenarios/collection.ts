import {
  type CollectionEndpoints,
  setupCollectionByIdEndpoint,
  setupCollectionsEndpoints,
} from "../server-mocks";

export type CollectionsScenarioOptions = CollectionEndpoints & {
  /** Optional error to make the by-id endpoint reject with. */
  error?: string;
};

/**
 * Wires both `setupCollectionsEndpoints` (the list/tree/items endpoints)
 * and `setupCollectionByIdEndpoint` (the per-id endpoint) at once. These
 * two are virtually always called as a pair when a test needs collection
 * navigation.
 */
export function setupCollectionsScenario({
  collections,
  rootCollection,
  trashCollection,
  currentUserId,
  error,
}: CollectionsScenarioOptions) {
  setupCollectionsEndpoints({
    collections,
    rootCollection,
    trashCollection,
    currentUserId,
  });
  setupCollectionByIdEndpoint({ collections, error });
}
