import { useEffect } from "react";

import { setupCollectionByIdEndpoint } from "__support__/server-mocks/collection";
import { renderWithProviders, screen } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { DashboardWideEventsSidebar } from "metabase/dashboard/components/DashboardEventsSidebar/DashboardWideEventsSidebar";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "metabase/redux/store/mocks";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  DashboardCard,
  DashboardTabId,
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

// plays the chart: a chart reports the events it drew
const DashCardChart = ({ dashcard }: { dashcard: DashboardCard }) => {
  const { onTimelineEventsShown } = useDashCardTimelineEvents(dashcard);
  useEffect(() => {
    onTimelineEventsShown?.([EVENT]);
  }, [onTimelineEventsShown]);
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

  it("tracks a dashboard once when its charts show events", () => {
    setup({ savedVisibility: EVENTS_RECORDED });

    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "dashboard_events_shown",
      target_id: DASHBOARD_ID,
    });
  });

  it("does not track a dashboard without events support", () => {
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
});
