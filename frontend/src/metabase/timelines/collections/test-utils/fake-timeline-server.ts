import fetchMock from "fetch-mock";

import type {
  Collection,
  CollectionId,
  Timeline,
  TimelineEvent,
} from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

export interface TimelineServerRequest {
  method: string;
  path: string;
  body: unknown;
}

interface TimelineServerOpts {
  collections: Collection[];
  timelines?: Timeline[];
  events?: TimelineEvent[];
}

/**
 * An in-memory stand-in for the timeline API. Each write changes the stored
 * rows inside the handler of its own request, and every request is logged so
 * that tests can assert the bodies the UI sent.
 */
export function setupTimelineServer({
  collections,
  timelines = [],
  events = [],
}: TimelineServerOpts) {
  const state = {
    collections: [...collections],
    timelines: timelines.map(({ events: _events, ...timeline }) => timeline),
    events: [...events],
  };
  const requests: TimelineServerRequest[] = [];
  let nextId = 100;

  const log = (method: string, url: string, body?: unknown) => {
    const path = new URL(url, "http://localhost").pathname;
    const parsed: unknown =
      typeof body === "string" ? JSON.parse(body) : undefined;
    requests.push({ method, path, body: parsed });
    return parsed;
  };

  // The UI sends these bodies through RTK Query endpoints typed with the
  // timeline request types, so they hold a subset of the entity's fields.
  const asTimelineFields = (body: unknown) => body as Partial<Timeline>;
  // Same as above, for the timeline event endpoints.
  const asEventFields = (body: unknown) => body as Partial<TimelineEvent>;
  // Same as above, for the collection update endpoint.
  const asCollectionFields = (body: unknown) => body as Partial<Collection>;

  // The required keys of the backend's POST schemas
  // (`metabase.timeline.api.timeline` and `metabase.timeline.api.timeline-event`)
  const missingFields = (body: object, fields: string[]) => {
    const values = new Map(Object.entries(body ?? {}));
    return fields.filter((field) => values.get(field) == null);
  };
  const badRequest = (fields: string[]) => ({
    status: 400,
    body: { errors: Object.fromEntries(fields.map((f) => [f, "required"])) },
  });

  const getParam = (url: string, name: string) =>
    new URL(url, "http://localhost").searchParams.get(name);

  const findCollection = (id: CollectionId | null | undefined) =>
    state.collections.find((collection) => collection.id === (id ?? "root"));

  const hydrate = (
    timeline: Timeline,
    { allEvents = false, withEvents = true } = {},
  ): Timeline => ({
    ...timeline,
    collection: findCollection(timeline.collection_id),
    events: withEvents
      ? state.events.filter(
          (event) =>
            event.timeline_id === timeline.id && (allEvents || !event.archived),
        )
      : undefined,
  });

  const timelineIdFromUrl = (url: string) =>
    Number(/\/api\/timeline\/(\d+)/.exec(url)?.[1]);
  const eventIdFromUrl = (url: string) =>
    Number(/\/api\/timeline-event\/(\d+)/.exec(url)?.[1]);

  fetchMock.get(/\/api\/collection\/(\d+|root)(\?.*)?$/, (call) => {
    const id = /\/api\/collection\/(\d+|root)/.exec(call.url)?.[1];
    const collection = findCollection(id === "root" ? "root" : Number(id));
    return collection ?? { status: 404, body: "Not found." };
  });

  fetchMock.put(/\/api\/collection\/(\d+)$/, (call) => {
    const body = asCollectionFields(log("PUT", call.url, call.options.body));
    const id = Number(/\/api\/collection\/(\d+)/.exec(call.url)?.[1]);
    state.collections = state.collections.map((collection) =>
      collection.id === id ? { ...collection, ...body } : collection,
    );
    return findCollection(id);
  });

  fetchMock.get(/\/api\/timeline\/collection\/(\d+|root)(\?.*)?$/, (call) => {
    log("GET", call.url);
    const id = /\/api\/timeline\/collection\/(\d+|root)/.exec(call.url)?.[1];
    const collectionId = id === "root" ? null : Number(id);
    const archived = getParam(call.url, "archived") === "true";
    const withEvents = getParam(call.url, "include") === "events";
    return state.timelines
      .filter(
        (timeline) =>
          (timeline.collection_id ?? null) === collectionId &&
          timeline.archived === archived,
      )
      .map((timeline) =>
        hydrate(timeline, { allEvents: archived, withEvents }),
      );
  });

  fetchMock.get(/\/api\/timeline(\?.*)?$/, (call) => {
    log("GET", call.url);
    const archived = getParam(call.url, "archived") === "true";
    return state.timelines
      .filter((timeline) => timeline.archived === archived)
      .map((timeline) => hydrate(timeline));
  });

  fetchMock.get(/\/api\/timeline\/(\d+)(\?.*)?$/, (call) => {
    log("GET", call.url);
    const timeline = state.timelines.find(
      (timeline) => timeline.id === timelineIdFromUrl(call.url),
    );
    if (!timeline) {
      return { status: 404, body: "Not found." };
    }
    return hydrate(timeline, {
      allEvents: getParam(call.url, "archived") === "true",
      withEvents: getParam(call.url, "include") === "events",
    });
  });

  fetchMock.post(/\/api\/timeline$/, (call) => {
    const body = asTimelineFields(log("POST", call.url, call.options.body));
    const missing = missingFields(body, ["name"]);
    if (missing.length > 0) {
      return badRequest(missing);
    }
    const timeline = createMockTimeline({
      ...body,
      id: nextId++,
      collection: undefined,
      events: undefined,
    });
    state.timelines.push(timeline);
    return timeline;
  });

  fetchMock.put(/\/api\/timeline\/(\d+)$/, (call) => {
    const body = asTimelineFields(log("PUT", call.url, call.options.body));
    const id = timelineIdFromUrl(call.url);
    const existing = state.timelines.find((timeline) => timeline.id === id);
    if (!existing) {
      return { status: 404, body: "Not found." };
    }
    // Archiving a timeline archives its events too, as the backend does.
    const { archived } = body;
    if (archived != null) {
      state.events = state.events.map((event) =>
        event.timeline_id === id ? { ...event, archived } : event,
      );
    }
    const updated: Timeline = { ...existing, ...body };
    state.timelines = state.timelines.map((timeline) =>
      timeline.id === id ? updated : timeline,
    );
    return hydrate(updated, { withEvents: false });
  });

  fetchMock.delete(/\/api\/timeline\/(\d+)$/, (call) => {
    log("DELETE", call.url);
    const id = timelineIdFromUrl(call.url);
    state.timelines = state.timelines.filter((timeline) => timeline.id !== id);
    state.events = state.events.filter((event) => event.timeline_id !== id);
    return { status: 204 };
  });

  fetchMock.get(/\/api\/timeline-event\/(\d+)$/, (call) => {
    log("GET", call.url);
    const event = state.events.find(
      (event) => event.id === eventIdFromUrl(call.url),
    );
    return event ?? { status: 404, body: "Not found." };
  });

  fetchMock.post(/\/api\/timeline-event$/, (call) => {
    const body = asEventFields(log("POST", call.url, call.options.body));
    const missing = missingFields(body, [
      "name",
      "timestamp",
      "timezone",
      "timeline_id",
    ]);
    if (missing.length > 0) {
      return badRequest(missing);
    }
    const event = createMockTimelineEvent({
      ...body,
      id: nextId++,
      created_at: "2026-01-01T00:00:00Z",
    });
    state.events.push(event);
    return event;
  });

  fetchMock.put(/\/api\/timeline-event\/(\d+)$/, (call) => {
    const body = asEventFields(log("PUT", call.url, call.options.body));
    const id = eventIdFromUrl(call.url);
    const existing = state.events.find((event) => event.id === id);
    if (!existing) {
      return { status: 404, body: "Not found." };
    }
    const updated: TimelineEvent = { ...existing, ...body };
    state.events = state.events.map((event) =>
      event.id === id ? updated : event,
    );
    return updated;
  });

  fetchMock.delete(/\/api\/timeline-event\/(\d+)$/, (call) => {
    log("DELETE", call.url);
    const id = eventIdFromUrl(call.url);
    state.events = state.events.filter((event) => event.id !== id);
    return { status: 204 };
  });

  return {
    state,
    /** The writes the UI sent, in order. */
    writes: () => requests.filter((request) => request.method !== "GET"),
  };
}
