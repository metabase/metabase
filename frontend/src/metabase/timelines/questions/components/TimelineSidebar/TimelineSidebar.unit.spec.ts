import dayjs from "dayjs";

import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  formatTitle,
  getEventsXDomain,
  getFocusedTimelines,
} from "./TimelineSidebar";

const releases = createMockTimeline({
  id: 1,
  name: "Releases",
  events: [
    createMockTimelineEvent({ id: 1, name: "RC1" }),
    createMockTimelineEvent({ id: 2, name: "RC2" }),
  ],
});

const marketing = createMockTimeline({
  id: 2,
  name: "Marketing",
  events: [createMockTimelineEvent({ id: 3, name: "Launch" })],
});

describe("getFocusedTimelines", () => {
  it("returns all timelines unchanged when there is no focus", () => {
    expect(getFocusedTimelines([releases, marketing], null)).toEqual([
      releases,
      marketing,
    ]);
  });

  it("keeps only the focused events within each timeline", () => {
    const result = getFocusedTimelines([releases, marketing], [2]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Releases");
    expect(result[0].events?.map((event) => event.id)).toEqual([2]);
  });

  it("drops timelines that have no focused events", () => {
    const result = getFocusedTimelines([releases, marketing], [3]);
    expect(result.map((timeline) => timeline.name)).toEqual(["Marketing"]);
  });

  it("can focus events across multiple timelines", () => {
    const result = getFocusedTimelines([releases, marketing], [1, 3]);
    expect(result.map((timeline) => timeline.name)).toEqual([
      "Releases",
      "Marketing",
    ]);
    expect(result[0].events?.map((event) => event.id)).toEqual([1]);
    expect(result[1].events?.map((event) => event.id)).toEqual([3]);
  });
});

describe("getEventsXDomain", () => {
  it("returns undefined when there are no events", () => {
    expect(
      getEventsXDomain([createMockTimeline({ events: [] })]),
    ).toBeUndefined();
  });

  it("returns the min and max event timestamps across timelines", () => {
    const timelines = [
      createMockTimeline({
        events: [
          createMockTimelineEvent({ timestamp: "2027-06-15T00:00:00Z" }),
          createMockTimelineEvent({ timestamp: "2027-06-03T00:00:00Z" }),
        ],
      }),
      createMockTimeline({
        events: [
          createMockTimelineEvent({ timestamp: "2027-06-27T00:00:00Z" }),
        ],
      }),
    ];

    const domain = getEventsXDomain(timelines);
    expect(domain?.[0].toISOString()).toBe("2027-06-03T00:00:00.000Z");
    expect(domain?.[1].toISOString()).toBe("2027-06-27T00:00:00.000Z");
    expect(domain?.[0].utcOffset()).toBe(0);
  });
});

describe("formatTitle", () => {
  const june3 = dayjs.utc("2027-06-03T00:00:00Z");
  const june27 = dayjs.utc("2027-06-27T00:00:00Z");
  const july5 = dayjs.utc("2027-07-05T00:00:00Z");

  it("returns a generic title without a domain", () => {
    expect(formatTitle()).toBe("Events");
  });

  it("snaps same-week dates to one week bucket (Jun 7 and Jun 10 are both the week of Jun 6)", () => {
    const june7 = dayjs.utc("2027-06-07T00:00:00Z");
    const june10 = dayjs.utc("2027-06-10T00:00:00Z");
    expect(formatTitle([june7, june10], "week")).toBe("Events in June 6, 2027");
  });

  it("buckets a single month group to the chart granularity", () => {
    expect(formatTitle([june3, june27], "month")).toBe("Events in June 2027");
  });

  it("buckets a single year group to the chart granularity", () => {
    expect(formatTitle([june3, june27], "year")).toBe("Events in 2027");
  });

  it("uses 'on' for a single day", () => {
    expect(formatTitle([june3, june3], "day")).toBe("Events on June 3, 2027");
  });

  it("shows a bucket range when the group spans multiple buckets", () => {
    expect(formatTitle([june27, july5], "month")).toBe(
      "Events between June 2027 and July 2027",
    );
  });

  it("falls back to specific dates without a unit", () => {
    expect(formatTitle([june3, june27])).toBe(
      "Events between Jun 3, 2027 and Jun 27, 2027",
    );
  });
});
