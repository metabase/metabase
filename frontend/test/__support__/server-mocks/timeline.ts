import fetchMock from "fetch-mock";

import type { CollectionId, Timeline } from "metabase-types/api";

type TimelineResponse = Timeline[] | (() => Promise<Timeline[]>);

export function setupTimelinesEndpoints(response: TimelineResponse) {
  fetchMock.get("path:/api/timeline", response);
}

export function setupCollectionTimelinesEndpoint(
  collectionId: CollectionId,
  response: TimelineResponse,
) {
  fetchMock.get(`path:/api/timeline/collection/${collectionId}`, response);
}
