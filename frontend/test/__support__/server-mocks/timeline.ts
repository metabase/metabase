import fetchMock from "fetch-mock";

import type { CollectionId, Timeline } from "metabase-types/api";

export function setupTimelinesEndpoints(timelines: Timeline[], delay?: number) {
  fetchMock.get(
    "path:/api/timeline",
    (call) => {
      // Mirror the endpoint's `id` filter: return only the requested
      // timelines when one or more ids are passed.
      const ids = new URL(call.url).searchParams
        .getAll("id")
        .map((id) => Number(id));
      return ids.length > 0
        ? timelines.filter((timeline) => ids.includes(timeline.id))
        : timelines;
    },
    delay != null ? { delay } : undefined,
  );
}

export function setupCollectionTimelinesEndpoints(
  collectionId: CollectionId,
  timelines: Timeline[],
) {
  fetchMock.get(`path:/api/timeline/collection/${collectionId}`, timelines);
}
