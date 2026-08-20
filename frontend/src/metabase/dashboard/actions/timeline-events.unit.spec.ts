import { getMainStore } from "__support__/entities-store";
import { timelineApi } from "metabase/api";
import { getDashCardVisibleTimelineEvents } from "metabase/dashboard/timeline-events/selectors";
import {
  createMockDashboardState,
  createMockState,
  createMockStoreDashboard,
} from "metabase/redux/store/mocks";
import {
  hideTimelineEvents,
  showTimelineEvents,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import { updateDashCardsTimelineEventsVisibility } from "./timeline-events";

const DASHCARD_ID = 1;
const COLLECTION_ID = 5;

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
const timeline = createMockTimeline({
  id: 10,
  collection_id: COLLECTION_ID,
  events: [eventA, eventB],
});

async function setup({
  isEditing = false,
  savedVisibility,
}: {
  isEditing?: boolean;
  savedVisibility?: TimelineEventsVisibility;
} = {}) {
  const store = getMainStore(
    createMockState({
      dashboard: createMockDashboardState({
        dashboardId: 1,
        dashboards: {
          1: createMockStoreDashboard({
            id: 1,
            collection_id: COLLECTION_ID,
            dashcards: [DASHCARD_ID],
          }),
        },
        dashcards: {
          [DASHCARD_ID]: createMockDashboardCard({
            id: DASHCARD_ID,
            visualization_settings: savedVisibility
              ? { "timeline_events.visibility": savedVisibility }
              : {},
          }),
        },
        editingDashboard: isEditing ? createMockDashboard({ id: 1 }) : null,
      }),
    }),
  );
  await store.dispatch(
    timelineApi.util.upsertQueryData("listTimelines", { include: "events" }, [
      timeline,
    ]),
  );
  return store;
}

const getVisibleEventIds = (store: Awaited<ReturnType<typeof setup>>) =>
  getDashCardVisibleTimelineEvents(store.getState(), DASHCARD_ID).map(
    (event) => event.id,
  );

const getSavedVisibility = (store: Awaited<ReturnType<typeof setup>>) =>
  store.getState().dashboard.dashcards[DASHCARD_ID].visualization_settings?.[
    "timeline_events.visibility"
  ];

describe("updateDashCardsTimelineEventsVisibility", () => {
  it("hides an event without touching the dashcard settings when viewing", async () => {
    const store = await setup();

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getSavedVisibility(store)).toBeUndefined();
    expect(
      store.getState().dashboard.dashcards[DASHCARD_ID].isDirty,
    ).toBeFalsy();
  });

  it("saves the hidden event into the dashcard settings when editing", async () => {
    const store = await setup({ isEditing: true });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getSavedVisibility(store)).toEqual({
      hidden_event_ids: [eventA.id],
    });
    expect(store.getState().dashboard.dashcards[DASHCARD_ID].isDirty).toBe(
      true,
    );
  });

  it("applies the visibility saved in the dashcard settings", async () => {
    const store = await setup({
      savedVisibility: { hidden_timeline_ids: [10] },
    });

    expect(getVisibleEventIds(store)).toEqual([]);
  });

  it("clears the saved setting when events return to the default when editing", async () => {
    const store = await setup({
      isEditing: true,
      savedVisibility: { hidden_event_ids: [eventA.id] },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          showTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getSavedVisibility(store)).toBeUndefined();
  });
});
