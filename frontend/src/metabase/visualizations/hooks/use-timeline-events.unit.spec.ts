import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import * as embeddingConfig from "metabase/embedding/config";
import { mockIsEmbeddingSdk } from "metabase/embedding-sdk/mocks/config-mock";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type {
  RawSeries,
  Timeline,
  TimelineEvent,
  TimelineEventsVisibility,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useTimelineEvents } from "./use-timeline-events";

registerVisualizations();

const SHOWN_EVENT = createMockTimelineEvent({
  id: 1,
  timeline_id: 10,
  timestamp: "2024-02-15T00:00:00Z",
});
const HIDDEN_EVENT = createMockTimelineEvent({
  id: 2,
  timeline_id: 10,
  timestamp: "2024-02-20T00:00:00Z",
});
const OUT_OF_RANGE_EVENT = createMockTimelineEvent({
  id: 3,
  timeline_id: 10,
  timestamp: "2030-02-15T00:00:00Z",
});
const ARCHIVED_EVENT = createMockTimelineEvent({
  id: 4,
  timeline_id: 10,
  timestamp: "2024-02-16T00:00:00Z",
  archived: true,
});
const TIMELINE = createMockTimeline({
  id: 10,
  events: [SHOWN_EVENT, HIDDEN_EVENT, OUT_OF_RANGE_EVENT, ARCHIVED_EVENT],
});

const SAVED_VISIBILITY: TimelineEventsVisibility = {
  "timeline.selected_timeline_ids": [TIMELINE.id],
  "timeline.excluded_timeline_event_ids": [HIDDEN_EVENT.id],
};

const DATASET = createMockDataset({
  data: createMockDatasetData({
    cols: [
      createMockDatetimeColumn({ name: "CREATED_AT", unit: "month" }),
      createMockNumericColumn({ name: "count" }),
    ],
    rows: [
      ["2024-01-01", 1],
      ["2024-03-01", 2],
    ],
  }),
});

const getSeries = (
  visualization_settings: VisualizationSettings,
): RawSeries => [
  {
    card: createMockCard({ display: "line", visualization_settings }),
    ...DATASET,
  },
];

const setup = ({
  savedSettings = SAVED_VISIBILITY,
  timelineEvents,
  timelineEventsVisibility,
  timelines = [TIMELINE],
  series = getSeries(savedSettings),
  settings = getComputedSettingsForSeries(series),
  onTimelineEventsShown,
  isDashboard = false,
}: {
  savedSettings?: VisualizationSettings;
  timelineEvents?: TimelineEvent[];
  timelineEventsVisibility?: TimelineEventsVisibility;
  timelines?: Timeline[];
  series?: RawSeries;
  settings?: VisualizationProps["settings"];
  onTimelineEventsShown?: VisualizationProps["onTimelineEventsShown"];
  isDashboard?: boolean;
} = {}) => {
  setupTimelinesEndpoints(timelines);
  return renderHookWithProviders(
    (props: Pick<VisualizationProps, "series" | "settings">) =>
      useTimelineEvents({
        timelineEvents,
        timelineEventsVisibility,
        onTimelineEventsShown,
        isDashboard,
        ...props,
      }),
    { initialProps: { series, settings } },
  );
};

const getTimelineRequests = () =>
  fetchMock.callHistory.calls("path:/api/timeline");

describe("useTimelineEvents", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads the events a question was saved with", async () => {
    const { result } = setup();

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });
    expect(getTimelineRequests()).toHaveLength(1);
  });

  it("drops events outside the chart's range and archived events", async () => {
    const { result } = setup({
      savedSettings: { "timeline.selected_timeline_ids": [TIMELINE.id] },
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([
        SHOWN_EVENT,
        HIDDEN_EVENT,
      ]);
    });
  });

  it("uses the events it is given instead of loading them", () => {
    const { result } = setup({
      timelineEvents: [OUT_OF_RANGE_EVENT, SHOWN_EVENT],
    });

    expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    expect(getTimelineRequests()).toHaveLength(0);
  });

  it("prefers the visibility it is given over the card settings", async () => {
    const { result } = setup({
      savedSettings: { "timeline.selected_timeline_ids": [] },
      timelineEventsVisibility: SAVED_VISIBILITY,
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });
  });

  it("loads nothing when the question never recorded events", () => {
    const { result } = setup({ savedSettings: {} });

    expect(result.current.timelineEvents).toEqual([]);
    expect(getTimelineRequests()).toHaveLength(0);
  });

  it("loads nothing when events are turned off", () => {
    const { result } = setup({
      savedSettings: { ...SAVED_VISIBILITY, "timeline_events.enabled": false },
    });

    expect(result.current.timelineEvents).toEqual([]);
    expect(getTimelineRequests()).toHaveLength(0);
  });

  it("loads nothing when the host selects no timelines", () => {
    const { result } = setup({
      timelineEventsVisibility: { "timeline.selected_timeline_ids": [] },
    });

    expect(result.current.timelineEvents).toEqual([]);
    expect(getTimelineRequests()).toHaveLength(0);
  });

  it("shows nothing when the chart has no data", () => {
    const { result } = setup({
      series: [
        {
          card: createMockCard({
            display: "line",
            visualization_settings: SAVED_VISIBILITY,
          }),
          ...createMockDataset({
            data: createMockDatasetData({ cols: DATASET.data.cols, rows: [] }),
          }),
        },
      ],
    });

    expect(result.current.timelineEvents).toEqual([]);
  });

  it("reports when events are shown", async () => {
    const onTimelineEventsShown = jest.fn();
    setup({ onTimelineEventsShown });

    await waitFor(() => {
      expect(onTimelineEventsShown).toHaveBeenCalled();
    });
  });

  it("does not report when no events are shown", () => {
    const onTimelineEventsShown = jest.fn();
    setup({ savedSettings: {}, onTimelineEventsShown });

    expect(onTimelineEventsShown).not.toHaveBeenCalled();
  });

  it("keeps the same events and reports once when rerendered with the same inputs", async () => {
    const onTimelineEventsShown = jest.fn();
    const series = getSeries(SAVED_VISIBILITY);
    const settings = getComputedSettingsForSeries(series);
    const { result, rerender } = setup({
      series,
      settings,
      onTimelineEventsShown,
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });
    const events = result.current.timelineEvents;

    rerender({ series, settings });

    expect(result.current.timelineEvents).toBe(events);
    expect(onTimelineEventsShown).toHaveBeenCalledTimes(1);
  });

  it("drops the events when the settings turn the chart into a non-timeseries one", async () => {
    const series = getSeries(SAVED_VISIBILITY);
    const { result, rerender } = setup({ series });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });

    rerender({
      series,
      settings: {
        ...getComputedSettingsForSeries(series),
        "graph.x_axis.scale": "ordinal",
      },
    });

    expect(result.current.timelineEvents).toEqual([]);
  });

  it.each([
    [
      "public links",
      () =>
        jest.spyOn(embeddingConfig, "isPublicEmbedding").mockReturnValue(true),
    ],
    [
      "static embeds",
      () =>
        jest.spyOn(embeddingConfig, "isStaticEmbedding").mockReturnValue(true),
    ],
    ["the embedding SDK", () => mockIsEmbeddingSdk()],
  ])(
    "does not load events on standalone questions in %s",
    async (_surface, mockSurface) => {
      await mockSurface();

      const { result } = setup();

      expect(result.current.timelineEvents).toEqual([]);
      expect(getTimelineRequests()).toHaveLength(0);
    },
  );

  describe.each([
    ["public dashboards", "isPublicEmbedding"],
    ["static embedded dashboards", "isStaticEmbedding"],
  ] as const)("%s", (_surface, configMethod) => {
    beforeEach(() => {
      jest.spyOn(embeddingConfig, configMethod).mockReturnValue(true);
    });

    it("shows the supplied events without requesting collection timelines", () => {
      const { result } = setup({
        isDashboard: true,
        timelineEvents: [SHOWN_EVENT],
      });

      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
      expect(getTimelineRequests()).toHaveLength(0);
    });

    it.each([undefined, []])(
      "does not fetch additional events when the payload is %s",
      (timelineEvents) => {
        const { result } = setup({ isDashboard: true, timelineEvents });

        expect(result.current.timelineEvents).toEqual([]);
        expect(getTimelineRequests()).toHaveLength(0);
      },
    );
  });

  it("only shows saved events on an authenticated SDK dashboard", async () => {
    await mockIsEmbeddingSdk();
    const unrelatedTimeline = createMockTimeline({
      id: 20,
      events: [
        createMockTimelineEvent({
          id: 5,
          timeline_id: 20,
          timestamp: SHOWN_EVENT.timestamp,
        }),
      ],
    });
    const { result } = setup({
      isDashboard: true,
      timelines: [TIMELINE, unrelatedTimeline],
    });

    await waitFor(() => {
      expect(result.current.timelineEvents).toEqual([SHOWN_EVENT]);
    });
    expect(getTimelineRequests()).toHaveLength(1);
  });
});
