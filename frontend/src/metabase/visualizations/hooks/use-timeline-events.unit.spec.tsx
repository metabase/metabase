import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCollectionTimelinesEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Dashboard, TimelineEvent } from "metabase-types/api";
import {
  createMockDashboard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useTimelineEvents } from "./use-timeline-events";

const event1 = createMockTimelineEvent({ id: 101, timeline_id: 1 });
const event2 = createMockTimelineEvent({ id: 102, timeline_id: 1 });
const event3 = createMockTimelineEvent({ id: 201, timeline_id: 2 });

const timeline1 = createMockTimeline({ id: 1, events: [event1, event2] });
const timeline2 = createMockTimeline({ id: 2, events: [event3] });

const DASHBOARD_COLLECTION_ID = 7;

const dashboard = createMockDashboard({
  collection_id: DASHBOARD_COLLECTION_ID,
});

interface SetupOpts {
  timelineEvents?: TimelineEvent[];
  settings?: ComputedVisualizationSettings;
  dashboard?: Dashboard;
  selectedTimelineEventIds?: number[];
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
}

const setup = (opts: SetupOpts = {}) => {
  setupTimelinesEndpoints([timeline1, timeline2]);
  setupCollectionTimelinesEndpoints(DASHBOARD_COLLECTION_ID, [timeline1]);
  setupCollectionTimelinesEndpoints("root", [timeline2]);

  return renderHookWithProviders(
    (props: SetupOpts) => useTimelineEvents({ settings: {}, ...props }),
    { initialProps: opts },
  );
};

describe("useTimelineEvents", () => {
  it("should return events passed as props without fetching", () => {
    const { result } = setup({ timelineEvents: [event1] });

    expect(result.current.timelineEvents).toEqual([event1]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should return no events without a selection or a dashboard", () => {
    const { result } = setup({ settings: {} });

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should fetch only the selected timelines when a selection exists", async () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [1] },
      dashboard,
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1, event2]);
    });

    const calls = fetchMock.callHistory.calls("path:/api/timeline");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("id=1");
  });

  it("should filter out excluded events from a selection", async () => {
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

  it("should hide all events when the stored selection is empty", () => {
    const { result } = setup({
      settings: { "timeline.selected_timeline_ids": [] },
      dashboard,
    });

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should default to the dashboard collection's timelines without a selection", async () => {
    const { result } = setup({ settings: {}, dashboard });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1, event2]);
    });

    expect(
      fetchMock.callHistory.calls(
        `path:/api/timeline/collection/${DASHBOARD_COLLECTION_ID}`,
      ),
    ).toHaveLength(1);
  });

  it("should use the root collection for dashboards without a collection", async () => {
    const { result } = setup({
      settings: {},
      dashboard: createMockDashboard({ collection_id: null }),
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event3]);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/timeline/collection/root"),
    ).toHaveLength(1);
  });

  it("should apply exclusions to the collection default", async () => {
    const { result } = setup({
      settings: { "timeline.excluded_timeline_event_ids": [102] },
      dashboard,
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([event1]);
    });
  });

  it("should manage selection locally when no handlers are passed", async () => {
    const { result } = setup({ settings: {}, dashboard });

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
