import { act, renderWithProviders, waitFor } from "__support__/ui";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "metabase/redux/store/mocks";
import {
  hideTimelineEvents,
  showTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import { registerVisualizations } from "metabase/visualizations/register";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockDataset,
  createMockDatasetData,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { updateDashCardsTimelineEventsVisibility } from "../actions/timeline-events";

import { useDashboardTimelines } from "./hooks";

registerVisualizations();

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DASHBOARD_ID = 1;
const DASHCARD_ID = 2;

const EVENT = createMockTimelineEvent({
  id: 100,
  timeline_id: 10,
  timestamp: "2024-02-15T00:00:00Z",
});
const TIMELINE = createMockTimeline({ id: 10, events: [EVENT] });
const OUT_OF_RANGE_TIMELINE = createMockTimeline({
  id: TIMELINE.id,
  events: [
    createMockTimelineEvent({
      id: 101,
      timeline_id: TIMELINE.id,
      timestamp: "2030-02-15T00:00:00Z",
    }),
  ],
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

const DashboardTimelines = () => {
  useDashboardTimelines();
  return null;
};

function setup({
  savedVisibility,
  timeline = TIMELINE,
}: {
  savedVisibility?: VisualizationSettings;
  timeline?: typeof TIMELINE;
} = {}) {
  const card = createMockCard({
    display: "line",
    visualization_settings: { ...savedVisibility },
  });
  const dashcard = createMockDashboardCard({
    id: DASHCARD_ID,
    dashboard_id: DASHBOARD_ID,
    card,
  });

  const { store } = renderWithProviders(
    <MockDashboardContext dashboardId={DASHBOARD_ID} withTimelineEvents>
      <DashboardTimelines />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboardId: DASHBOARD_ID,
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
            value: [timeline],
          },
        ]),
      }),
    },
  );

  return store;
}

type Store = ReturnType<typeof setup>;

const updateEventVisibility = (
  store: Store,
  update: typeof hideTimelineEvents,
) =>
  act(() => {
    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) => update(visibility, [EVENT], timelines),
      ),
    );
  });

describe("useDashboardTimelines", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("tracks a dashboard that shows events once per load", async () => {
    const store = setup({ savedVisibility: EVENTS_RECORDED });

    await waitFor(() => {
      expect(trackSimpleEvent).toHaveBeenCalledWith({
        event: "dashboard_events_shown",
        target_id: DASHBOARD_ID,
      });
    });

    updateEventVisibility(store, hideTimelineEvents);
    updateEventVisibility(store, showTimelineEvents);

    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
  });

  it("does not track a dashboard whose questions never recorded events", () => {
    setup();

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("does not track events outside the chart's date range", () => {
    setup({
      savedVisibility: EVENTS_RECORDED,
      timeline: OUT_OF_RANGE_TIMELINE,
    });

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });
});
