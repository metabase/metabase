import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
import { getTimelineEventCheckbox } from "__support__/timelines";
import {
  act,
  getTestStoreAndWrapper,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import {
  openEventsSidebar,
  removeCardFromDashboard,
  selectTimelineEvents,
  setDashCardTimelineEventsVisibility,
} from "metabase/dashboard/actions";
import { DashboardEventsSidebar } from "metabase/dashboard/components/DashboardEventsSidebar/DashboardEventsSidebar";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import * as embeddingConfig from "metabase/embedding/config";
import { selectTab } from "metabase/redux/dashboard";
import { useTimelineEvents } from "metabase/visualizations/hooks/use-timeline-events";
import { registerVisualizations } from "metabase/visualizations/register";
import { getComputedSettingsForSeries } from "metabase/viz-core";
import type {
  DashboardCard,
  DashboardTabId,
  QuestionDashboardCard,
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
import { getDashCardVisibleTimelineEventIds } from "./selectors";

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
  dashcards,
}: {
  savedVisibility?: VisualizationSettings;
  withTimelineEvents?: boolean;
  selectedTabId?: DashboardTabId | null;
  dashcardTabId?: DashboardTabId | null;
  withSidebar?: boolean;
  dashcards?: QuestionDashboardCard[];
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
  const allDashcards = dashcards ?? [dashcard];

  return renderWithProviders(
    <MockDashboardContext
      dashboardId={DASHBOARD_ID}
      withTimelineEvents={withTimelineEvents}
    >
      {/* two charts report, the dashboard is tracked once */}
      <DashCardChart dashcard={dashcard} />
      <DashCardChart dashcard={dashcard} />
      {withSidebar && <DashboardEventsSidebar />}
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
          selectedTabId,
          sidebar: withSidebar
            ? { name: SIDEBAR_NAME.events, props: {} }
            : { props: {} },
          dashboards: {
            [DASHBOARD_ID]: createMockStoreDashboard({
              id: DASHBOARD_ID,
              dashcards: allDashcards.map(({ id }) => id),
            }),
          },
          dashcards: Object.fromEntries(
            allDashcards.map((dashcard) => [dashcard.id, dashcard]),
          ),
          dashcardData: Object.fromEntries(
            allDashcards.map((dashcard) => [
              dashcard.id,
              { [dashcard.card.id]: DATASET },
            ]),
          ),
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

  it.each(["chart", "dashcard_menu", "dashboard_menu"] as const)(
    "tracks opening the events panel from the %s once until it closes",
    async (location) => {
      const { store } = setup();
      trackSimpleEvent.mockClear();

      await act(async () => {
        store.dispatch(
          openEventsSidebar({ dashcardId: DASHCARD_ID }, location),
        );
        store.dispatch(openEventsSidebar({}, location));
      });

      expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dashboard_events_panel_opened",
        target_id: DASHBOARD_ID,
        triggered_from: location,
      });
    },
  );

  it("does not track reopening the panel from within it", async () => {
    const { store } = setup();
    trackSimpleEvent.mockClear();

    await act(async () => {
      store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));
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

  it("applies mixed dashboard-wide selections only to eligible charts on the current tab", async () => {
    const question = createMockCard({
      display: "line",
      visualization_settings: EVENTS_RECORDED,
    });
    const dashcards = [
      createMockDashboardCard({ id: 2, card: question, dashboard_tab_id: 5 }),
      createMockDashboardCard({
        id: 3,
        card: createMockCard({ ...question, visualization_settings: {} }),
        dashboard_tab_id: 5,
      }),
      createMockDashboardCard({
        id: 4,
        card: createMockCard({ ...question, display: "table" }),
        dashboard_tab_id: 5,
      }),
      createMockDashboardCard({
        id: 5,
        card: createMockCard({
          ...question,
          visualization_settings: {
            ...EVENTS_RECORDED,
            "timeline_events.enabled": false,
          },
        }),
        dashboard_tab_id: 5,
      }),
      createMockDashboardCard({ id: 6, card: question, dashboard_tab_id: 6 }),
    ];
    const { store } = setup({ dashcards, selectedTabId: 5, withSidebar: true });

    await screen.findByText(EVENT.name);
    expect(getTimelineEventCheckbox(EVENT.name)).toBePartiallyChecked();

    await userEvent.click(getTimelineEventCheckbox(EVENT.name));

    expect(getTimelineEventCheckbox(EVENT.name)).toBeChecked();
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 2)).toEqual([
      EVENT.id,
    ]);
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 3)).toEqual([
      EVENT.id,
    ]);

    await userEvent.click(getTimelineEventCheckbox(EVENT.name));

    expect(getTimelineEventCheckbox(EVENT.name)).not.toBeChecked();
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 2)).toEqual([]);
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 3)).toEqual([]);
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 6)).toEqual([
      EVENT.id,
    ]);
    expect(
      Object.keys(store.getState().dashboard.timelineEvents.overrides),
    ).toEqual(["2", "3"]);
    expect(Object.values(store.getState().dashboard.dashcards)).toEqual(
      dashcards,
    );
  });

  it.each(["removing its chart", "switching tabs"])(
    "closes a targeted panel after %s while preserving other chart choices",
    async (change) => {
      const question = createMockCard({
        display: "line",
        visualization_settings: EVENTS_RECORDED,
      });
      const dashcards = [
        createMockDashboardCard({
          id: DASHCARD_ID,
          card: question,
          dashboard_tab_id: 5,
        }),
        createMockDashboardCard({ id: 3, card: question, dashboard_tab_id: 5 }),
      ];
      const { store } = setup({
        dashcards,
        selectedTabId: 5,
        withSidebar: true,
      });
      await act(async () => {
        store.dispatch(
          setDashCardTimelineEventsVisibility({
            3: { "timeline.selected_timeline_ids": [] },
          }),
        );
        store.dispatch(
          selectTimelineEvents({
            dashcardId: DASHCARD_ID,
            eventIds: [EVENT.id],
          }),
        );
        store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));
      });
      expect(
        await screen.findByTestId("dashboard-events-sidebar"),
      ).toBeInTheDocument();

      await act(async () => {
        if (change === "removing its chart") {
          await store.dispatch(
            removeCardFromDashboard({
              dashcardId: DASHCARD_ID,
              cardId: question.id,
            }),
          );
        } else {
          store.dispatch(selectTab({ tabId: 6 }));
        }
      });

      await waitFor(() =>
        expect(
          screen.queryByTestId("dashboard-events-sidebar"),
        ).not.toBeInTheDocument(),
      );
      expect(store.getState().dashboard.timelineEvents.selection).toBeNull();
      expect(getDashCardVisibleTimelineEventIds(store.getState(), 3)).toEqual(
        [],
      );
      expect(store.getState().dashboard.timelineEvents.overrides[3]).toEqual({
        "timeline.selected_timeline_ids": [],
      });
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
