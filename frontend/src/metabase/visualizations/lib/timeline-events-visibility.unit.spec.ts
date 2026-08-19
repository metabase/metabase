import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  aggregateVisibleEventIds,
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

const visibleNames = (
  visibility?: TimelineEventsVisibility,
  enabled?: boolean,
) =>
  resolveVisibleTimelineEvents({ ...context, visibility, enabled }).map(
    (event) => event.name,
  );

describe("resolveVisibleTimelineEvents", () => {
  it("shows every non-archived event of the collection's timelines by default, sorted by date", () => {
    expect(visibleNames()).toEqual(["RC1", "Launch", "RC2"]);
  });

  it("shows nothing when events are turned off", () => {
    expect(visibleNames(undefined, false)).toEqual([]);
  });

  it("applies saved overrides", () => {
    expect(
      visibleNames({
        hidden_timeline_ids: [marketing.id],
        shown_timeline_ids: [incidents.id],
        hidden_event_ids: [rc2.id],
      }),
    ).toEqual(["RC1", "Outage"]);
  });

  it("ignores ids that no longer exist", () => {
    expect(
      visibleNames({ hidden_timeline_ids: [999], hidden_event_ids: [999] }),
    ).toEqual(["RC1", "Launch", "RC2"]);
  });
});

describe("isDefaultVisibility", () => {
  it("is true only when nothing differs from the default", () => {
    expect(isDefaultVisibility(undefined)).toBe(true);
    expect(isDefaultVisibility({ hidden_event_ids: [] })).toBe(true);
    expect(isDefaultVisibility({ hidden_timeline_ids: [1] })).toBe(false);
  });
});

describe("hiding and showing timelines", () => {
  it("hides a collection timeline and brings it back without leaving overrides behind", () => {
    const hidden = hideTimelines({}, [releases], context);
    expect(visibleNames(hidden)).toEqual(["Launch"]);

    const shown = showTimelines(hidden, [releases], context);
    expect(visibleNames(shown)).toEqual(["RC1", "Launch", "RC2"]);
    expect(shown).toEqual({});
  });

  it("shows a timeline from another collection and returns to the default when hidden again", () => {
    const shown = showTimelines({}, [incidents], context);
    expect(visibleNames(shown)).toEqual(["RC1", "Launch", "RC2", "Outage"]);

    expect(hideTimelines(shown, [incidents], context)).toEqual({});
  });
});

describe("hiding and showing single events", () => {
  it("hides one event and keeps the rest of its timeline", () => {
    const visibility = hideTimelineEvents({}, [rc1], context);
    expect(visibleNames(visibility)).toEqual(["Launch", "RC2"]);
  });

  it("keeps events added later hidden once every event of a timeline was hidden", () => {
    const visibility = hideTimelineEvents({}, [rc1, rc2], context);

    const rc3 = createMockTimelineEvent({
      id: 14,
      timeline_id: 1,
      name: "RC3",
    });
    const withNewRelease = {
      ...context,
      timelines: [
        createMockTimeline({ ...releases, events: [rc1, rc2, rc3] }),
        marketing,
      ],
    };
    expect(
      resolveVisibleTimelineEvents({ ...withNewRelease, visibility }).map(
        (event) => event.name,
      ),
    ).toEqual(["Launch"]);
  });

  it("shows only the requested event of a hidden timeline", () => {
    const visibility = showTimelineEvents(
      hideTimelines({}, [releases], context),
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["RC1", "Launch"]);
  });

  it("shows only the requested event of a timeline from another collection", () => {
    const secondOutage = createMockTimelineEvent({
      id: 32,
      timeline_id: 3,
      name: "Second outage",
    });
    const withTwoIncidents = {
      ...context,
      timelines: [
        releases,
        marketing,
        createMockTimeline({ ...incidents, events: [outage, secondOutage] }),
      ],
    };
    const visibility = showTimelineEvents({}, [outage], withTwoIncidents);
    expect(
      resolveVisibleTimelineEvents({ ...withTwoIncidents, visibility }).map(
        (event) => event.name,
      ),
    ).toEqual(["RC1", "Launch", "RC2", "Outage"]);
  });

  it("hiding and showing the same events leaves no overrides behind", () => {
    const hidden = hideTimelineEvents({}, [rc1, launch], context);
    expect(showTimelineEvents(hidden, [rc1, launch], context)).toEqual({});
  });

  it("does not affect other timelines", () => {
    const visibility = hideTimelineEvents(
      hideTimelines({}, [marketing], context),
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["RC2"]);
    expect(
      visibleNames(showTimelineEvents(visibility, [rc1], context)),
    ).toEqual(["RC1", "RC2"]);
  });
});

describe("aggregateVisibleEventIds", () => {
  it("splits events into visible on every chart and visible on some charts", () => {
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
});
