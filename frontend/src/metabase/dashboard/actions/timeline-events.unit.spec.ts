import { getMainStore } from "__support__/entities-store";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "__support__/state";
import { getDashCardById } from "metabase/dashboard/selectors";
import {
  getDashCardTimelineEventsVisibility,
  getDashCardVisibleTimelineEventIds,
} from "metabase/dashboard/timeline-events/selectors";
import {
  hideTimelineEvents,
  showCreatedTimelineEvent,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { SimpleEventSchema } from "metabase-types/analytics";
import type { VisualizationSettings } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { updateDashCardsTimelineEventsVisibility } from "./timeline-events";

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const DASHBOARD_ID = 1;
const DASHCARD_ID = 1;

const eventA = createMockTimelineEvent({
  id: 100,
  timeline_id: 10,
  timestamp: "2021-12-25T00:00:00Z",
});
const eventB = createMockTimelineEvent({
  id: 101,
  timeline_id: 10,
  timestamp: "2021-12-26T00:00:00Z",
});
const timeline = createMockTimeline({ id: 10, events: [eventA, eventB] });

// a timeline the events sidebar can select before the refetch lands
const unloadedTimelineId = 11;

function setup({
  savedVisibility,
  duplicateQuestion = false,
}: {
  savedVisibility?: VisualizationSettings;
  duplicateQuestion?: boolean;
} = {}) {
  const card = createMockCard({
    visualization_settings: { ...savedVisibility },
  });
  const dashcards = [
    createMockDashboardCard({
      id: DASHCARD_ID,
      card,
      visualization_settings: { "card.title": "First placement" },
    }),
    ...(duplicateQuestion
      ? [
          createMockDashboardCard({
            id: 2,
            card,
            visualization_settings: { "card.title": "Second placement" },
          }),
        ]
      : []),
  ];
  return getMainStore(
    createMockState({
      dashboard: createMockDashboardState({
        dashboardId: DASHBOARD_ID,
        dashboards: {
          [DASHBOARD_ID]: createMockStoreDashboard({
            id: DASHBOARD_ID,
            dashcards: dashcards.map(({ id }) => id),
          }),
        },
        dashcards: Object.fromEntries(
          dashcards.map((dashcard) => [dashcard.id, dashcard]),
        ),
      }),
      "metabase-api": seedApiQueryCache(createMockApiState(), [
        {
          endpointName: "listTimelines",
          arg: { include: "events" },
          value: [timeline],
        },
      ]),
    }),
  );
}

type Store = ReturnType<typeof setup>;

const getVisibleEventIds = (store: Store) =>
  getDashCardVisibleTimelineEventIds(store.getState(), DASHCARD_ID);

const getDashCard = (store: Store) =>
  getDashCardById(store.getState(), DASHCARD_ID);

const getReportedVisibilityChanges = () => {
  const events: SimpleEventSchema[] = trackSimpleEvent.mock.calls.map(
    ([event]: [SimpleEventSchema]) => event,
  );
  return events
    .filter(({ event }) => event === "dashboard_events_visibility_changed")
    .map(({ event_detail }) => event_detail);
};

describe("dashboard timeline events visibility", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("shows the events the question was saved with", () => {
    const store = setup({
      savedVisibility: {
        "timeline.selected_timeline_ids": [timeline.id],
        "timeline.excluded_timeline_event_ids": [eventB.id],
      },
    });

    expect(getVisibleEventIds(store)).toEqual([eventA.id]);
  });

  it("lets a viewer show events for their session without touching the question", () => {
    const store = setup();

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          showTimelines(visibility, [timeline.id], timelines),
        { location: "dashboard", intent: "show" },
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getDashCard(store).card.visualization_settings).toEqual({});
    expect(getDashCard(store).isDirty).toBeFalsy();
  });

  it("changes only the targeted placement of a question and preserves both saved settings", () => {
    const savedVisibility = {
      "graph.show_values": true,
      "timeline.selected_timeline_ids": [timeline.id],
      "timeline.excluded_timeline_event_ids": [],
    };
    const store = setup({ savedVisibility, duplicateQuestion: true });
    const savedDashcards = store.getState().dashboard.dashcards;

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          hideTimelineEvents(visibility, [eventA], timelines),
        { location: "dashboard", intent: "hide" },
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getDashCardVisibleTimelineEventIds(store.getState(), 2)).toEqual([
      eventA.id,
      eventB.id,
    ]);
    expect(store.getState().dashboard.dashcards).toEqual(savedDashcards);
  });

  it("tracks hiding and showing events for the session", () => {
    const store = setup({
      savedVisibility: {
        "timeline.selected_timeline_ids": [timeline.id],
        "timeline.excluded_timeline_event_ids": [],
      },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          hideTimelineEvents(visibility, [eventA], timelines),
        { location: "dashcard", intent: "hide" },
      ),
    );

    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "dashboard_events_visibility_changed",
      target_id: DASHBOARD_ID,
      triggered_from: "dashcard",
      event_detail: "hidden",
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          showTimelineEvents(visibility, [eventA], timelines),
        { location: "dashboard", intent: "show" },
      ),
    );

    expect(trackSimpleEvent).toHaveBeenLastCalledWith({
      event: "dashboard_events_visibility_changed",
      target_id: DASHBOARD_ID,
      triggered_from: "dashboard",
      event_detail: "shown",
    });
    expect(trackSimpleEvent).toHaveBeenCalledTimes(2);
  });

  it("keeps the session as it is when a toggle is already applied", () => {
    const store = setup({
      savedVisibility: {
        "timeline.selected_timeline_ids": [timeline.id],
        "timeline.excluded_timeline_event_ids": [],
      },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          showTimelines(visibility, [timeline.id], timelines),
        { location: "dashboard", intent: "show" },
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getReportedVisibilityChanges()).toEqual([]);
  });

  it("makes a created event visible for the session", () => {
    const store = setup();
    const createdEvent = createMockTimelineEvent({
      id: 102,
      timeline_id: unloadedTimelineId,
      timestamp: "2021-12-27T00:00:00Z",
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, timelines) =>
          showCreatedTimelineEvent(visibility, createdEvent, timelines),
        { location: "dashboard", intent: "create" },
      ),
    );

    expect(
      getDashCardTimelineEventsVisibility(store.getState(), DASHCARD_ID),
    ).toEqual({
      "timeline.selected_timeline_ids": [unloadedTimelineId],
      "timeline.excluded_timeline_event_ids": [],
    });
    expect(getReportedVisibilityChanges()).toEqual([]);
  });
});
