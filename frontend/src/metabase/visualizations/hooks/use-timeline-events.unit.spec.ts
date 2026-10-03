import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useTimelineEvents } from "./use-timeline-events";

const EVENT = createMockTimelineEvent({ id: 7, timeline_id: 1 });
const SETTINGS: VisualizationSettings = {
  "timeline.selected_timeline_ids": [1],
};

const setup = ({
  skip,
  timelineEvents,
}: {
  skip?: boolean;
  timelineEvents?: (typeof EVENT)[];
} = {}) => {
  setupTimelinesEndpoints([createMockTimeline({ id: 1, events: [EVENT] })]);

  return renderHookWithProviders(
    () => useTimelineEvents({ settings: SETTINGS, timelineEvents, skip }),
    {},
  );
};

const getTimelineRequests = () =>
  fetchMock.callHistory.calls("path:/api/timeline");

describe("useTimelineEvents", () => {
  it("fetches the selected timelines' events by default", async () => {
    const { result } = setup();

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.timelineEvents).toEqual([EVENT]));
    expect(getTimelineRequests()).toHaveLength(1);
  });

  it("returns events passed in without fetching", () => {
    const { result } = setup({ timelineEvents: [EVENT] });

    expect(result.current.timelineEvents).toEqual([EVENT]);
    expect(result.current.isLoading).toBe(false);
  });

  it("does not fetch when skipped", () => {
    const { result } = setup({ skip: true });

    // A query that will fetch reports loading from its first render.
    expect(result.current.isLoading).toBe(false);
    expect(result.current.timelineEvents).toEqual([]);
  });

  it("ignores events passed in when skipped", () => {
    const { result } = setup({ skip: true, timelineEvents: [EVENT] });

    expect(result.current.timelineEvents).toEqual([]);
  });
});
