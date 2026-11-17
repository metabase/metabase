import {
  createMockCollection,
  createMockTimeline,
} from "metabase-types/api/mocks";

import { getTimelineDetailsHeaderProps } from "./timeline-details-header";

describe("getTimelineDetailsHeaderProps", () => {
  it("should use the collection's name for default timelines", () => {
    const timeline = createMockTimeline({
      name: "Metrics events",
      default: true,
      collection: createMockCollection({ name: "Analytics" }),
    });

    expect(getTimelineDetailsHeaderProps(timeline).title).toBe(
      "Analytics events",
    );
  });

  it("should use the timeline's name for non-default timelines", () => {
    const timeline = createMockTimeline({
      name: "Metrics events",
      default: false,
      collection: createMockCollection({ name: "Analytics" }),
    });

    expect(getTimelineDetailsHeaderProps(timeline).title).toBe(
      "Metrics events",
    );
  });
});
