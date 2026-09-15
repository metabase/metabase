import { renderHook } from "@testing-library/react";
import fetchMock from "fetch-mock";
import type { PropsWithChildren } from "react";
import { useMount } from "react-use";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "__support__/state";
import {
  getTestStoreAndWrapper,
  renderWithProviders,
  screen,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { DashboardEventsSidebar } from "metabase/dashboard/components/DashboardEventsSidebar/DashboardEventsSidebar";
import { DashboardWideEventsSidebar } from "metabase/dashboard/components/DashboardEventsSidebar/DashboardWideEventsSidebar";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import * as embeddingConfig from "metabase/embedding/config";
import { useTimelineEvents } from "metabase/visualizations/hooks/use-timeline-events";
import { registerVisualizations } from "metabase/visualizations/register";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type {
  DashboardCard,
  DashboardTabId,
  TimelineEvent,
  TimelineEventsVisibility,
  VisualizationSettings,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { useDashCardTimelineEvents } from "./hooks";

registerVisualizations();

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DASHBOARD_ID = 1;
const DASHCARD_ID = 2;

const EVENT = createMockTimelineEvent({
  id: 100,
  name: "Launch",
  timeline_id: 10,
  timestamp: "2024-02-15T00:00:00Z",
});
const TIMELINE = createMockTimeline({ id: 10, events: [EVENT] });
const EXCLUDED_EVENT = createMockTimelineEvent({
  ...EVENT,
  id: 101,
  name: "Excluded launch",
});
const UNRELATED_EVENT = createMockTimelineEvent({
  ...EVENT,
  id: 102,
  timeline_id: 20,
  name: "Unrelated collection event",
});

const EVENTS_RECORDED: VisualizationSettings = {
  "timeline.selected_timeline_ids": [TIMELINE.id],
  "timeline.excluded_timeline_event_ids": [],
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

const DashCardChart = ({ dashcard }: { dashcard: DashboardCard }) => {
  const { onTimelineEventsShown } = useDashCardTimelineEvents(dashcard);
  useMount(() => onTimelineEventsShown?.());
  return null;
};

function setup({
  savedVisibility,
  withTimelineEvents = true,
  selectedTabId = null,
  dashcardTabId = null,
  withSidebar = false,
}: {
  savedVisibility?: VisualizationSettings;
  withTimelineEvents?: boolean;
  selectedTabId?: DashboardTabId | null;
  dashcardTabId?: DashboardTabId | null;
  withSidebar?: boolean;
} = {}) {
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ ...ROOT_COLLECTION, can_write: true }),
    ],
  });
  const card = createMockCard({
    display: "line",
    visualization_settings: { ...savedVisibility },
  });
  const dashcard = createMockDashboardCard({
    id: DASHCARD_ID,
    dashboard_id: DASHBOARD_ID,
    dashboard_tab_id: dashcardTabId,
    card,
  });

  renderWithProviders(
    <MockDashboardContext
      dashboardId={DASHBOARD_ID}
      withTimelineEvents={withTimelineEvents}
    >
      {/* two charts report, the dashboard is tracked once */}
      <DashCardChart dashcard={dashcard} />
      <DashCardChart dashcard={dashcard} />
      {withSidebar && <DashboardWideEventsSidebar />}
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          selectedTabId,
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              id: DASHBOARD_ID,
              dashcards: [DASHCARD_ID],
            }),
          },
          dashcards: { [DASHCARD_ID]: dashcard },
          dashcardData: { [DASHCARD_ID]: { [card.id]: DATASET } },
        }),
        "metabase-api": seedApiQueryCache(createMockApiState(), [
          {
            endpointName: "listTimelines",
            arg: { include: "events" },
            value: [TIMELINE],
          },
        ]),
      }),
    },
  );
}

describe("dashboard timeline events", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tracks a dashboard once when its charts show events", () => {
    setup({ savedVisibility: EVENTS_RECORDED });

    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "dashboard_events_shown",
      target_id: DASHBOARD_ID,
    });
  });

  it("does not track event visibility when dashboard event controls are disabled", () => {
    setup({ savedVisibility: EVENTS_RECORDED, withTimelineEvents: false });

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("does not track a dashcard whose timeline events are disabled", () => {
    setup({
      savedVisibility: {
        ...EVENTS_RECORDED,
        "timeline_events.enabled": false,
      },
    });

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("lists the events of the charts on the selected tab", async () => {
    setup({
      savedVisibility: EVENTS_RECORDED,
      selectedTabId: 5,
      dashcardTabId: 5,
      withSidebar: true,
    });

    expect(await screen.findByText(EVENT.name)).toBeInTheDocument();
  });

  it("shows the empty state when the charts are on another tab", async () => {
    setup({
      savedVisibility: EVENTS_RECORDED,
      selectedTabId: 5,
      dashcardTabId: 6,
      withSidebar: true,
    });

    expect(
      await screen.findByTestId("dashboard-events-empty-state"),
    ).toBeInTheDocument();
    expect(screen.queryByText(EVENT.name)).not.toBeInTheDocument();
  });

  describe.each([
    ["public dashboards", "isPublicEmbedding"],
    ["static embedded dashboards", "isStaticEmbedding"],
  ] as const)("%s", (_surface, configMethod) => {
    beforeEach(() => {
      jest.spyOn(embeddingConfig, configMethod).mockReturnValue(true);
    });

    it("uses the shared payload and saved selection despite broader cached events and session overrides", () => {
      const { result } = setupReadOnlyDashboard({ timelineEvents: [EVENT] });

      expect(result.current.timelineEvents).toEqual([EVENT]);
      expect(result.current.dashcardProps.timelineEventsVisibility).toEqual({
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [EXCLUDED_EVENT.id],
      });
      expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
    });

    it("does not expose event selection or sidebar callbacks", () => {
      const { result } = setupReadOnlyDashboard({ timelineEvents: [EVENT] });

      expect(result.current.dashcardProps.onOpenTimelines).toBeUndefined();
      expect(
        result.current.dashcardProps.onSelectTimelineEvents,
      ).toBeUndefined();
      expect(
        result.current.dashcardProps.onDeselectTimelineEvents,
      ).toBeUndefined();
      expect(
        result.current.dashcardProps.selectedTimelineEventIds,
      ).toBeUndefined();
    });

    it.each([undefined, []])(
      "does not fall back to cached collection events when the payload is %s",
      (timelineEvents) => {
        const { result } = setupReadOnlyDashboard({ timelineEvents });

        expect(result.current.timelineEvents).toEqual([]);
        expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(
          0,
        );
      },
    );
  });

  it.each([{}, { dashcardId: DASHCARD_ID }])(
    "does not reopen a collection-backed sidebar from stale state when controls are disabled (%j)",
    (sidebarProps) => {
      renderWithProviders(
        <MockDashboardContext withTimelineEvents={false}>
          <div data-testid="sidebar-container">
            <DashboardEventsSidebar />
          </div>
        </MockDashboardContext>,
        {
          storeInitialState: createMockState({
            dashboard: createMockDashboardState({
              sidebar: { name: "events", props: sidebarProps },
            }),
          }),
        },
      );

      expect(screen.getByTestId("sidebar-container")).toBeEmptyDOMElement();
      expect(fetchMock.callHistory.calls("path:/api/timeline")).toHaveLength(0);
    },
  );
});

function setupReadOnlyDashboard({
  timelineEvents,
}: {
  timelineEvents?: TimelineEvent[];
}) {
  const savedVisibility: TimelineEventsVisibility = {
    "timeline.selected_timeline_ids": [TIMELINE.id],
    "timeline.excluded_timeline_event_ids": [EXCLUDED_EVENT.id],
  };
  const card = createMockCard({
    display: "line",
    visualization_settings: savedVisibility,
  });
  const dashcard = createMockDashboardCard({
    id: DASHCARD_ID,
    card,
    timeline_events: timelineEvents,
  });
  const series = [{ card, ...DATASET }];
  const settings = getComputedSettingsForSeries(series);
  const { wrapper: Wrapper } = getTestStoreAndWrapper({
    initialRoute: "/",
    storeInitialState: createMockState({
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD_ID,
        dashcards: { [DASHCARD_ID]: dashcard },
        dashcardData: { [DASHCARD_ID]: { [card.id]: DATASET } },
        timelineEvents: {
          overrides: {
            [DASHCARD_ID]: {
              "timeline.selected_timeline_ids": [
                TIMELINE.id,
                UNRELATED_EVENT.timeline_id,
              ],
              "timeline.excluded_timeline_event_ids": [],
            },
          },
          selection: {
            dashcardId: DASHCARD_ID,
            eventIds: [UNRELATED_EVENT.id],
          },
          hasTrackedEventsShown: false,
        },
      }),
      "metabase-api": seedApiQueryCache(createMockApiState(), [
        {
          endpointName: "listTimelines",
          arg: { include: "events" },
          value: [
            createMockTimeline({
              ...TIMELINE,
              events: [EVENT, EXCLUDED_EVENT],
            }),
            createMockTimeline({
              id: UNRELATED_EVENT.timeline_id,
              events: [UNRELATED_EVENT],
            }),
          ],
        },
      ]),
    }),
  });

  return renderHook(
    () => {
      const dashcardProps = useDashCardTimelineEvents(dashcard);
      return {
        dashcardProps,
        ...useTimelineEvents({
          ...dashcardProps,
          series,
          settings,
          isDashboard: true,
        }),
      };
    },
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <Wrapper>
          <MockDashboardContext withTimelineEvents={false}>
            {children}
          </MockDashboardContext>
        </Wrapper>
      ),
    },
  );
}
