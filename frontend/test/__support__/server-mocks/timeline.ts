import fetchMock from "fetch-mock";

import type {
  BaseEntityId,
  CollectionId,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";

type TimelineResponse = Timeline[] | (() => Promise<Timeline[]>);

export function setupTimelinesEndpoints(response: TimelineResponse) {
  fetchMock.get("path:/api/timeline", response);
}

export function setupTimelineEndpoint(timeline: Timeline) {
  fetchMock.get(`path:/api/timeline/${timeline.id}`, timeline);
}

export function setupTimelineByEntityIdEndpoint(
  entityId: BaseEntityId,
  timeline: Timeline,
) {
  fetchMock.get(`path:/api/timeline/${entityId}`, timeline);
}

export function setupTimelineEventByEntityIdEndpoint(
  entityId: BaseEntityId,
  event: TimelineEvent,
) {
  fetchMock.get(`path:/api/timeline-event/${entityId}`, event);
}

export function setupCollectionTimelinesEndpoint(
  collectionId: CollectionId,
  response: TimelineResponse,
) {
  fetchMock.get(`path:/api/timeline/collection/${collectionId}`, response);
}
