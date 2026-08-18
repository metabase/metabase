import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  aggregateVisibleEventIds,
  getCollectionTimelines,
  hideTimelineEvents,
  hideTimelines,
  isDefaultVisibility,
  resolveVisibleTimelineEvents,
  showTimelineEvents,
  showTimelines,
} from "./timeline-events-visibility";

const COLLECTION_ID = 7;

const rc1 = createMockTimelineEvent({
  id: 11,
  timeline_id: 1,
  name: "RC1",
  timestamp: "2027-06-03T00:00:00Z",
});
const rc2 = createMockTimelineEvent({
  id: 12,
  timeline_id: 1,
  name: "RC2",
  timestamp: "2027-06-15T00:00:00Z",
});
const archivedRelease = createMockTimelineEvent({
  id: 13,
  timeline_id: 1,
  name: "Archived",
  archived: true,
  timestamp: "2027-06-01T00:00:00Z",
});
const launch = createMockTimelineEvent({
  id: 21,
  timeline_id: 2,
  name: "Launch",
  timestamp: "2027-06-10T00:00:00Z",
});
const outage = createMockTimelineEvent({
  id: 31,
  timeline_id: 3,
  name: "Outage",
  timestamp: "2027-06-20T00:00:00Z",
});
const rootEvent = createMockTimelineEvent({
  id: 41,
  timeline_id: 4,
  name: "Root",
  timestamp: "2027-06-25T00:00:00Z",
});

const releases = createMockTimeline({
  id: 1,
  name: "Releases",
  collection_id: COLLECTION_ID,
  events: [rc1, rc2, archivedRelease],
});
const marketing = createMockTimeline({
  id: 2,
  name: "Marketing",
  collection_id: COLLECTION_ID,
  events: [launch],
});
const incidents = createMockTimeline({
  id: 3,
  name: "Incidents",
  collection_id: 99,
  events: [outage],
});
const rootTimeline = createMockTimeline({
  id: 4,
  name: "Root",
  collection_id: null,
  events: [rootEvent],
});

const timelines = [releases, marketing, incidents, rootTimeline];
const context = { timelines, collectionId: COLLECTION_ID };

const resolveIds = (visibility?: TimelineEventsVisibility, enabled?: boolean) =>
  resolveVisibleTimelineEvents({ ...context, visibility, enabled }).map(
    (event) => event.id,
  );

describe("getCollectionTimelines", () => {
  it("returns the timelines of the given collection", () => {
    expect(getCollectionTimelines(timelines, COLLECTION_ID)).toEqual([
      releases,
      marketing,
    ]);
  });

  it.each([null, undefined, "root"] as const)(
    "returns root timelines for collection %s",
    (collectionId) => {
      expect(getCollectionTimelines(timelines, collectionId)).toEqual([
        rootTimeline,
      ]);
    },
  );

  it("returns nothing for pseudo collections", () => {
    expect(getCollectionTimelines(timelines, "personal")).toEqual([]);
  });
});

describe("resolveVisibleTimelineEvents", () => {
  it("shows all non-archived events of the collection timelines by default, sorted by timestamp", () => {
    expect(resolveIds()).toEqual([rc1.id, launch.id, rc2.id]);
  });

  it("returns nothing when disabled", () => {
    expect(resolveIds(undefined, false)).toEqual([]);
  });

  it("respects hidden timelines, shown timelines and hidden events", () => {
    expect(
      resolveIds({
        hidden_timeline_ids: [marketing.id],
        shown_timeline_ids: [incidents.id],
        hidden_event_ids: [rc2.id],
      }),
    ).toEqual([rc1.id, outage.id]);
  });

  it("lets shown win over hidden for the same timeline", () => {
    expect(
      resolveIds({
        hidden_timeline_ids: [releases.id],
        shown_timeline_ids: [releases.id],
      }),
    ).toEqual([rc1.id, launch.id, rc2.id]);
  });

  it("ignores hidden event ids that do not belong to visible timelines", () => {
    expect(resolveIds({ hidden_event_ids: [outage.id, 999] })).toEqual([
      rc1.id,
      launch.id,
      rc2.id,
    ]);
  });
});

describe("isDefaultVisibility", () => {
  it("treats undefined, empty and empty-list overrides as default", () => {
    expect(isDefaultVisibility(undefined)).toBe(true);
    expect(isDefaultVisibility({})).toBe(true);
    expect(isDefaultVisibility({ hidden_event_ids: [] })).toBe(true);
  });

  it("detects overrides", () => {
    expect(isDefaultVisibility({ hidden_timeline_ids: [1] })).toBe(false);
  });
});

describe("showTimelines / hideTimelines", () => {
  it("hides a collection timeline", () => {
    const visibility = hideTimelines({}, [releases], context);
    expect(visibility).toEqual({ hidden_timeline_ids: [releases.id] });
    expect(resolveIds(visibility)).toEqual([launch.id]);
  });

  it("re-shows a hidden collection timeline and drops its event overrides", () => {
    const visibility = showTimelines(
      { hidden_timeline_ids: [releases.id], hidden_event_ids: [rc1.id] },
      [releases],
      context,
    );
    expect(visibility).toEqual({});
  });

  it("shows a timeline from another collection", () => {
    const visibility = showTimelines({}, [incidents], context);
    expect(visibility).toEqual({ shown_timeline_ids: [incidents.id] });
    expect(resolveIds(visibility)).toEqual([
      rc1.id,
      launch.id,
      rc2.id,
      outage.id,
    ]);
  });

  it("hides a shown timeline from another collection back to the default", () => {
    const visibility = hideTimelines(
      { shown_timeline_ids: [incidents.id] },
      [incidents],
      context,
    );
    expect(visibility).toEqual({});
  });
});

describe("hideTimelineEvents", () => {
  it("hides a single event of a visible timeline", () => {
    const visibility = hideTimelineEvents({}, [rc1], context);
    expect(visibility).toEqual({ hidden_event_ids: [rc1.id] });
    expect(resolveIds(visibility)).toEqual([launch.id, rc2.id]);
  });

  it("collapses to a hidden timeline once every non-archived event is hidden", () => {
    const visibility = hideTimelineEvents(
      { hidden_event_ids: [rc1.id] },
      [rc2],
      context,
    );
    expect(visibility).toEqual({ hidden_timeline_ids: [releases.id] });
  });

  it("collapses a shown timeline from another collection back to the default", () => {
    const visibility = hideTimelineEvents(
      { shown_timeline_ids: [incidents.id] },
      [outage],
      context,
    );
    expect(visibility).toEqual({});
  });

  it("does nothing for events of an already hidden timeline", () => {
    expect(hideTimelineEvents({}, [outage], context)).toEqual({});
  });

  it("does not touch overrides of other timelines", () => {
    const visibility = hideTimelineEvents(
      { hidden_timeline_ids: [marketing.id] },
      [rc1],
      context,
    );
    expect(visibility).toEqual({
      hidden_timeline_ids: [marketing.id],
      hidden_event_ids: [rc1.id],
    });
  });
});

describe("showTimelineEvents", () => {
  it("un-hides an individually hidden event", () => {
    const visibility = showTimelineEvents(
      { hidden_event_ids: [rc1.id, rc2.id] },
      [rc1],
      context,
    );
    expect(visibility).toEqual({ hidden_event_ids: [rc2.id] });
  });

  it("shows only the requested event of a hidden collection timeline", () => {
    const visibility = showTimelineEvents(
      { hidden_timeline_ids: [releases.id] },
      [rc1],
      context,
    );
    expect(visibility).toEqual({ hidden_event_ids: [rc2.id] });
    expect(resolveIds(visibility)).toEqual([rc1.id, launch.id]);
  });

  it("shows only the requested event of a timeline from another collection", () => {
    const withTwoIncidents = createMockTimeline({
      ...incidents,
      events: [outage, createMockTimelineEvent({ id: 32, timeline_id: 3 })],
    });
    const visibility = showTimelineEvents({}, [outage], {
      timelines: [releases, marketing, withTwoIncidents],
      collectionId: COLLECTION_ID,
    });
    expect(visibility).toEqual({
      shown_timeline_ids: [incidents.id],
      hidden_event_ids: [32],
    });
  });

  it("showing every event of a hidden timeline shows the whole timeline", () => {
    const visibility = showTimelineEvents(
      { hidden_timeline_ids: [releases.id] },
      [rc1, rc2],
      context,
    );
    expect(visibility).toEqual({});
  });

  it("ignores events of unknown timelines", () => {
    expect(
      showTimelineEvents(
        {},
        [createMockTimelineEvent({ timeline_id: 999 })],
        context,
      ),
    ).toEqual({});
  });

  it("round-trips with hideTimelineEvents", () => {
    const hidden = hideTimelineEvents({}, [rc1, launch], context);
    expect(showTimelineEvents(hidden, [rc1, launch], context)).toEqual({});
  });
});

describe("aggregateVisibleEventIds", () => {
  it("returns empty lists without charts", () => {
    expect(aggregateVisibleEventIds([])).toEqual({
      visibleEventIds: [],
      partiallyVisibleEventIds: [],
    });
  });

  it("splits events into fully and partially visible", () => {
    expect(
      aggregateVisibleEventIds([
        [rc1.id, rc2.id],
        [rc2.id, launch.id],
        [rc2.id],
      ]),
    ).toEqual({
      visibleEventIds: [rc2.id],
      partiallyVisibleEventIds: [rc1.id, launch.id],
    });
  });

  it("counts duplicates within one chart once", () => {
    expect(aggregateVisibleEventIds([[rc1.id, rc1.id], [rc1.id]])).toEqual({
      visibleEventIds: [rc1.id],
      partiallyVisibleEventIds: [],
    });
  });
});
