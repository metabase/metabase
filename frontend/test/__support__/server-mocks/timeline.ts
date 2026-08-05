import fetchMock from "fetch-mock";

import type { CollectionId, Timeline } from "metabase-types/api";

export function setupTimelinesEndpoints(timelines: Timeline[], delay?: number) {
  fetchMock.get(
    "path:/api/timeline",
    timelines,
    delay != null ? { delay } : undefined,
  );
}

export function setupCollectionTimelinesEndpoints(
  collectionId: CollectionId,
  timelines: Timeline[],
) {
  fetchMock.get(`path:/api/timeline/collection/${collectionId}`, timelines);
}
