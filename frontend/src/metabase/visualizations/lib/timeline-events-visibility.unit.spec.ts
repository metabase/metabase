import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  aggregateVisibleEventIds,
  getRecordedTimelineEventsVisibility,
  hideTimelineEvents,
  hideTimelines,
  resolveVisibleTimelineEvents,
  showTimelineEvents,
  showTimelines,
} from "./timeline-events-visibility";

const SELECTED = "timeline.selected_timeline_ids";
const EXCLUDED = "timeline.excluded_timeline_event_ids";

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
const context = timelines;

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
    expect(visibleNames({ [SELECTED]: [releases.id, marketing.id] })).toEqual([
      "RC1",
      "Launch",
      "RC2",
    ]);
  });

  it("shows nothing when events are turned off", () => {
    expect(visibleNames({ [SELECTED]: [releases.id] }, false)).toEqual([]);
  });

  it("hides single events of shown timelines", () => {
    expect(
      visibleNames({
        [SELECTED]: [releases.id, incidents.id],
        [EXCLUDED]: [rc2.id],
      }),
    ).toEqual(["RC1", "Outage"]);
  });

  it("ignores ids that no longer exist", () => {
    expect(
      visibleNames({
        [SELECTED]: [releases.id, 999],
        [EXCLUDED]: [999],
      }),
    ).toEqual(["RC1", "RC2"]);
  });
});

describe("getRecordedTimelineEventsVisibility", () => {
  it("reads a recorded selection out of the card settings", () => {
    const settings = {
      "graph.dimensions": ["CREATED_AT"],
      [SELECTED]: [releases.id],
      [EXCLUDED]: [rc2.id],
    };
    expect(getRecordedTimelineEventsVisibility(settings)).toBe(settings);
  });

  it("treats an empty selection as recorded", () => {
    const settings = { [SELECTED]: [] };
    expect(getRecordedTimelineEventsVisibility(settings)).toBe(settings);
  });

  it("is undefined when nothing was ever recorded", () => {
    expect(getRecordedTimelineEventsVisibility(undefined)).toBeUndefined();
    expect(getRecordedTimelineEventsVisibility({})).toBeUndefined();
    expect(
      getRecordedTimelineEventsVisibility({ [EXCLUDED]: [] }),
    ).toBeUndefined();
  });
});

describe("showing and hiding timelines", () => {
  it("shows a timeline and hides it again without leaving anything behind", () => {
    const shown = showTimelines({}, [releases.id], context);
    expect(visibleNames(shown)).toEqual(["RC1", "RC2"]);

    expect(hideTimelines(shown, [releases.id], context)).toEqual({
      [SELECTED]: [],
      [EXCLUDED]: [],
    });
  });

  it("showing a timeline brings back its individually hidden events", () => {
    const visibility = hideTimelineEvents(
      { [SELECTED]: [releases.id] },
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["RC2"]);

    expect(
      visibleNames(showTimelines(visibility, [releases.id], context)),
    ).toEqual(["RC1", "RC2"]);
  });
});

describe("showing and hiding single events", () => {
  it("hides one event and keeps the rest of its timeline", () => {
    const visibility = hideTimelineEvents(
      { [SELECTED]: [releases.id, marketing.id] },
      [rc1],
      context,
    );
    expect(visibleNames(visibility)).toEqual(["Launch", "RC2"]);
  });

  it("keeps events added later hidden once every event of a timeline was hidden", () => {
    const visibility = hideTimelineEvents(
      { [SELECTED]: [releases.id, marketing.id] },
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
    const shown = {
      [SELECTED]: [releases.id, marketing.id],
      [EXCLUDED]: [],
    };
    const hidden = hideTimelineEvents(shown, [rc1, launch], context);
    expect(showTimelineEvents(hidden, [rc1, launch], context)).toEqual(shown);
  });

  it("does not affect other timelines", () => {
    const visibility = hideTimelineEvents(
      { [SELECTED]: [releases.id] },
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

  it("treats every event as partially visible when one chart shows none", () => {
    expect(aggregateVisibleEventIds([[rc1.id, rc2.id], []])).toEqual({
      visibleEventIds: [],
      partiallyVisibleEventIds: [rc1.id, rc2.id],
    });
  });
});

describe("toggling a timeline the caller only partly knows about", () => {
  // Sidebars hold timelines whose events were narrowed to a chart's x-axis, so
  // toggling takes an id and resolves every event from the full list.
  it("does not exclude the events outside the range when showing", () => {
    expect(showTimelines({}, [releases.id], context)).toEqual({
      [SELECTED]: [releases.id],
      [EXCLUDED]: [],
    });
  });

  it("brings back the events outside the range when re-showing", () => {
    const hidden = hideTimelineEvents(
      { [SELECTED]: [releases.id] },
      [rc1],
      context,
    );
    expect(hidden[EXCLUDED]).toEqual([rc1.id]);

    expect(showTimelines(hidden, [releases.id], context)).toEqual({
      [SELECTED]: [releases.id],
      [EXCLUDED]: [],
    });
  });

  it("ignores an id that is not in the list", () => {
    expect(showTimelines({}, [999], context)).toEqual({
      [SELECTED]: [],
      [EXCLUDED]: [],
    });
  });
});
