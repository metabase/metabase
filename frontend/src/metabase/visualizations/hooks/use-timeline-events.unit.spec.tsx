import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupCollectionTimelinesEndpoints } from "__support__/server-mocks";
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
const archivedEvent = createMockTimelineEvent({
  id: 103,
  timeline_id: 1,
  archived: true,
});
const rootEvent = createMockTimelineEvent({ id: 201, timeline_id: 2 });

const collectionTimeline = createMockTimeline({
  id: 1,
  events: [event1, event2, archivedEvent],
});
const rootTimeline = createMockTimeline({ id: 2, events: [rootEvent] });

const DASHBOARD_COLLECTION_ID = 7;

const dashboard = createMockDashboard({
  collection_id: DASHBOARD_COLLECTION_ID,
});

const TIMESERIES_SETTINGS: ComputedVisualizationSettings = {
  "graph.x_axis.scale": "timeseries",
};

interface SetupOpts {
  timelineEvents?: TimelineEvent[];
  settings?: ComputedVisualizationSettings;
  dashboard?: Dashboard;
  selectedTimelineEventIds?: number[];
  onSelectTimelineEvents?: (events: TimelineEvent[]) => void;
  onDeselectTimelineEvents?: () => void;
}

const setup = (opts: SetupOpts = {}) => {
  setupCollectionTimelinesEndpoints(DASHBOARD_COLLECTION_ID, [
    collectionTimeline,
  ]);
  setupCollectionTimelinesEndpoints("root", [rootTimeline]);

  return renderHookWithProviders(
    (props: SetupOpts) =>
      useTimelineEvents({ settings: TIMESERIES_SETTINGS, ...props }),
    { initialProps: opts },
  );
};

describe("useTimelineEvents", () => {
  it("should return events passed as props without fetching", () => {
    const { result } = setup({ timelineEvents: [event1] });

    expect(result.current.timelineEvents).toEqual([event1]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should not fetch without a dashboard", () => {
    const { result } = setup({});

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should not fetch when events are disabled on the card", () => {
    const { result } = setup({
      settings: { ...TIMESERIES_SETTINGS, "timeline.events_enabled": false },
      dashboard,
    });

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should not fetch for charts without a timeseries x-axis", () => {
    const { result } = setup({
      settings: { "graph.x_axis.scale": "ordinal" },
      dashboard,
    });

    expect(result.current.timelineEvents).toEqual([]);
    expect(fetchMock.callHistory.calls()).toHaveLength(0);
  });

  it("should show the dashboard collection's unarchived events by default", async () => {
    const { result } = setup({ dashboard });

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
      dashboard: createMockDashboard({ collection_id: null }),
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([rootEvent]);
    });

    expect(
      fetchMock.callHistory.calls("path:/api/timeline/collection/root"),
    ).toHaveLength(1);
  });

  it("should manage selection locally when no handlers are passed", async () => {
    const { result } = setup({ dashboard });

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
      dashboard,
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
