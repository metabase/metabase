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

const timelines = [releases, marketing, incidents];
const context = { timelines };

const visibleNames = (
  visibility?: TimelineEventsVisibility,
  enabled?: boolean,
) =>
  resolveVisibleTimelineEvents({ timelines, visibility, enabled }).map(
    (event) => event.name,
  );

describe("resolveVisibleTimelineEvents", () => {
  it("shows nothing until a timeline is explicitly shown", () => {
    expect(visibleNames()).toEqual([]);
  });

  it("shows the non-archived events of shown timelines, sorted by date", () => {
    expect(
      visibleNames({ shown_timeline_ids: [releases.id, marketing.id] }),
    ).toEqual(["RC1", "Launch", "RC2"]);
  });

  it("shows nothing when events are turned off", () => {
    expect(visibleNames({ shown_timeline_ids: [releases.id] }, false)).toEqual(
      [],
    );
  });

  it("hides single events of shown timelines", () => {
    expect(
      visibleNames({
        shown_timeline_ids: [releases.id, incidents.id],
        hidden_event_ids: [rc2.id],
      }),
    ).toEqual(["RC1", "Outage"]);
  });

  it("ignores ids that no longer exist", () => {
    expect(
      visibleNames({
        shown_timeline_ids: [releases.id, 999],
        hidden_event_ids: [999],
      }),
    ).toEqual(["RC1", "RC2"]);
  });
});

describe("isDefaultVisibility", () => {
  it("is true only when nothing is shown", () => {
    expect(isDefaultVisibility(undefined)).toBe(true);
    expect(isDefaultVisibility({ hidden_event_ids: [] })).toBe(true);
    expect(isDefaultVisibility({ shown_timeline_ids: [1] })).toBe(false);
  });
});

describe("showing and hiding timelines", () => {
  it("shows a timeline and hides it again without leaving anything behind", () => {
    const shown = showTimelines({}, [releases]);
    expect(visibleNames(shown)).toEqual(["RC1", "RC2"]);

    expect(hideTimelines(shown, [releases])).toEqual({});
  });

  it("showing a timeline brings back its individually hidden events", () => {
    const visibility = hideTimelineEvents(
      { shown_timeline_ids: [releases.id] },
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["RC2"]);

    expect(visibleNames(showTimelines(visibility, [releases]))).toEqual([
      "RC1",
      "RC2",
    ]);
  });
});

describe("showing and hiding single events", () => {
  it("hides one event and keeps the rest of its timeline", () => {
    const visibility = hideTimelineEvents(
      { shown_timeline_ids: [releases.id, marketing.id] },
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["Launch", "RC2"]);
  });

  it("keeps events added later hidden once every event of a timeline was hidden", () => {
    const visibility = hideTimelineEvents(
      { shown_timeline_ids: [releases.id, marketing.id] },
      [rc1, rc2],
      context,
    );

    const rc3 = createMockTimelineEvent({
      id: 14,
      timeline_id: 1,
      name: "RC3",
    });
    const withNewRelease = [
      createMockTimeline({ ...releases, events: [rc1, rc2, rc3] }),
      marketing,
    ];
    expect(
      resolveVisibleTimelineEvents({
        timelines: withNewRelease,
        visibility,
      }).map((event) => event.name),
    ).toEqual(["Launch"]);
  });

  it("shows only the requested event of a timeline that isn't shown", () => {
    const visibility = showTimelineEvents({}, [rc1], context);
    expect(visibleNames(visibility)).toEqual(["RC1"]);
  });

  it("hiding and showing the same events leaves no leftovers behind", () => {
    const shown = { shown_timeline_ids: [releases.id, marketing.id] };
    const hidden = hideTimelineEvents(shown, [rc1, launch], context);
    expect(showTimelineEvents(hidden, [rc1, launch], context)).toEqual(shown);
  });

  it("does not affect other timelines", () => {
    const visibility = hideTimelineEvents(
      { shown_timeline_ids: [releases.id] },
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
