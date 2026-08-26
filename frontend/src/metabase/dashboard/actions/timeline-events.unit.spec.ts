import { getMainStore } from "__support__/entities-store";
import { getDashCardById } from "metabase/dashboard/selectors";
import { getDashCardVisibleTimelineEvents } from "metabase/dashboard/timeline-events/selectors";
import {
  createMockApiState,
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
  seedApiQueryCache,
} from "metabase/redux/store/mocks";
import {
  hideTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockCard,
  createMockDashboardCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { updateDashCardsTimelineEventsVisibility } from "./timeline-events";

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

function setup({
  savedVisibility,
}: { savedVisibility?: TimelineEventsVisibility } = {}) {
  return getMainStore(
    createMockState({
      dashboard: createMockDashboardState({
        dashboardId: 1,
        dashboards: {
          1: createMockStoreDashboard({ id: 1, dashcards: [DASHCARD_ID] }),
        },
        dashcards: {
          [DASHCARD_ID]: createMockDashboardCard({
            id: DASHCARD_ID,
            card: createMockCard({
              visualization_settings: { ...savedVisibility },
            }),
          }),
        },
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
  getDashCardVisibleTimelineEvents(store.getState(), DASHCARD_ID).map(
    (event) => event.id,
  );

const getDashCard = (store: Store) =>
  getDashCardById(store.getState(), DASHCARD_ID);

describe("dashboard timeline events visibility", () => {
  it("shows nothing for a question saved without events", () => {
    const store = setup();

    expect(getVisibleEventIds(store)).toEqual([]);
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
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getDashCard(store).card.visualization_settings).toEqual({});
    expect(getDashCard(store).isDirty).toBeFalsy();
  });

  it("lets a viewer hide a saved event for their session", () => {
    const savedVisibility = {
      "timeline.selected_timeline_ids": [timeline.id],
      "timeline.excluded_timeline_event_ids": [],
    };
    const store = setup({ savedVisibility });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getDashCard(store).card.visualization_settings).toEqual(
      savedVisibility,
    );
  });
});
