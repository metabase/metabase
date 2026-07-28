import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { TimelineEvent } from "metabase-types/api";
import {
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useTimelineEvents } from "./use-timeline-events";

const event1 = createMockTimelineEvent({ id: 101, timeline_id: 1 });
const event2 = createMockTimelineEvent({ id: 102, timeline_id: 1 });
const event3 = createMockTimelineEvent({ id: 201, timeline_id: 2 });

const timeline1 = createMockTimeline({ id: 1, events: [event1, event2] });
const timeline2 = createMockTimeline({ id: 2, events: [event3] });

interface SetupOpts {
  timelineEvents?: TimelineEvent[];
  settings?: ComputedVisualizationSettings;
  selectedTimelineEventIds?: number[];
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
}

const setup = (opts: SetupOpts = {}) => {
  setupTimelinesEndpoints([timeline1, timeline2]);

  return renderHookWithProviders(
    (props: SetupOpts) => useTimelineEvents({ settings: {}, ...props }),
    { initialProps: opts },
  );
};

describe("useTimelineEvents", () => {
  it("should return events passed as props without fetching", () => {
    const { result } = setup({ timelineEvents: [event1] });

    expect(result.current.timelineEvents).toEqual([event1]);
    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
  });

  it("should not fetch when no timelines are selected in settings", () => {
    const { result } = setup({ settings: {} });

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
  });

  it("should fetch and return events of selected timelines", async () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [1] },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1, event2]);
    });
  });

  it("should request only the selected timelines, in stable order", async () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [2, 1] },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toHaveLength(3);
    });

    const calls = fetchMock.callHistory.calls("path:/api/timeline");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("id=1&id=2");
  });

  it("should filter out excluded events", async () => {
    const { result } = setup({
      settings: {
        "timeline.selected_timeline_ids": [1, 2],
        "timeline.excluded_timeline_event_ids": [102],
      },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1, event3]);
    });
  });

  it("should ignore selected timeline ids that no longer exist", async () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [1, 999] },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1, event2]);
    });
  });

  it("should manage selection locally when no handlers are passed", async () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [1] },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toHaveLength(2);
    });

    act(() => {
      result.current.onSelectTimelineEvents?.([event1]);
    });
    expect(result.current.selectedTimelineEventIds).toEqual([101]);

    act(() => {
      result.current.onDeselectTimelineEvents?.();
    });
    expect(result.current.selectedTimelineEventIds).toEqual([]);
  });

  it("should pass through external selection handlers when provided", async () => {
    const onSelectTimelineEvents = jest.fn();
    const onDeselectTimelineEvents = jest.fn();
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [1] },
      selectedTimelineEventIds: [102],
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toHaveLength(2);
    });

    expect(result.current.selectedTimelineEventIds).toEqual([102]);
    expect(result.current.onSelectTimelineEvents).toBe(onSelectTimelineEvents);
    expect(result.current.onDeselectTimelineEvents).toBe(
      onDeselectTimelineEvents,
    );
  });
});
