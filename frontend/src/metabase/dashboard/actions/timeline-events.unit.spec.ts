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
  hideTimelines,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockDashboard,
  createMockDashboardCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  openEventsSidebar,
  updateDashCardsTimelineEventsVisibility,
} from "./timeline-events";

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

function setup({
  isEditing = false,
  savedVisibility,
  collectionId = COLLECTION_ID,
}: {
  isEditing?: boolean;
  savedVisibility?: TimelineEventsVisibility;
  collectionId?: number;
} = {}) {
  return getMainStore(
    createMockState({
      dashboard: createMockDashboardState({
        dashboardId: 1,
        dashboards: {
          1: createMockStoreDashboard({
            id: 1,
            collection_id: collectionId,
            dashcards: [DASHCARD_ID],
          }),
        },
        dashcards: {
          [DASHCARD_ID]: createMockDashboardCard({
            id: DASHCARD_ID,
            visualization_settings: {
              "timeline_events.visibility": savedVisibility,
            },
          }),
        },
        editingDashboard: isEditing ? createMockDashboard({ id: 1 }) : null,
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

const getSavedVisibility = (store: Store) =>
  getDashCardById(store.getState(), DASHCARD_ID).visualization_settings?.[
    "timeline_events.visibility"
  ];

describe("updateDashCardsTimelineEventsVisibility", () => {
  it("shows events without touching the dashcard settings when viewing", () => {
    const store = setup();
    expect(getVisibleEventIds(store)).toEqual([]);

    store.dispatch(
      updateDashCardsTimelineEventsVisibility([DASHCARD_ID], (visibility) =>
        showTimelines(visibility, [timeline]),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getSavedVisibility(store)).toBeUndefined();
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBeFalsy();
  });

  it("hides an event without touching the dashcard settings when viewing", () => {
    const store = setup({
      savedVisibility: { shown_timeline_ids: [timeline.id] },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getSavedVisibility(store)).toEqual({
      shown_timeline_ids: [timeline.id],
    });
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBeFalsy();
  });

  it("saves the shown timeline into the dashcard settings when editing", () => {
    const store = setup({ isEditing: true });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility([DASHCARD_ID], (visibility) =>
        showTimelines(visibility, [timeline]),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getSavedVisibility(store)).toEqual({
      shown_timeline_ids: [timeline.id],
    });
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBe(true);
  });

  it("saves the shown event into the dashcard settings when editing", () => {
    const store = setup({ isEditing: true });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          showTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventA.id]);
    expect(getSavedVisibility(store)).toEqual({
      shown_timeline_ids: [timeline.id],
      hidden_event_ids: [eventB.id],
    });
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBe(true);
  });

  it("saves an event hidden on a shown timeline when editing", () => {
    const store = setup({
      isEditing: true,
      savedVisibility: { shown_timeline_ids: [timeline.id] },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getSavedVisibility(store)).toEqual({
      shown_timeline_ids: [timeline.id],
      hidden_event_ids: [eventA.id],
    });
  });

  it("applies the visibility saved in the dashcard settings", () => {
    const store = setup({
      savedVisibility: {
        shown_timeline_ids: [timeline.id],
        hidden_event_ids: [eventB.id],
      },
    });

    expect(getVisibleEventIds(store)).toEqual([eventA.id]);
  });

  it("clears the saved setting when the last timeline is hidden when editing", () => {
    const store = setup({
      isEditing: true,
      savedVisibility: { shown_timeline_ids: [timeline.id] },
    });

    store.dispatch(
      updateDashCardsTimelineEventsVisibility([DASHCARD_ID], (visibility) =>
        hideTimelines(visibility, [timeline]),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([]);
    expect(getSavedVisibility(store)).toBeUndefined();
  });
});

describe("openEventsSidebar", () => {
  it("previews the collection's events on a chart with nothing saved", () => {
    const store = setup();
    expect(getVisibleEventIds(store)).toEqual([]);

    store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));

    expect(store.getState().dashboard.sidebar.name).toBe("events");
    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getSavedVisibility(store)).toBeUndefined();
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBeFalsy();
  });

  it("keeps the saved selection instead of previewing", () => {
    const store = setup({
      savedVisibility: {
        shown_timeline_ids: [timeline.id],
        hidden_event_ids: [eventA.id],
      },
    });

    store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
  });

  it("does not preview timelines from other collections", () => {
    const store = setup({ collectionId: 999 });

    store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));

    expect(getVisibleEventIds(store)).toEqual([]);
  });

  it("previews without dirtying while editing; a toggle then persists what's visible", () => {
    const store = setup({ isEditing: true });

    store.dispatch(openEventsSidebar({ dashcardId: DASHCARD_ID }));
    expect(getVisibleEventIds(store)).toEqual([eventA.id, eventB.id]);
    expect(getSavedVisibility(store)).toBeUndefined();
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBeFalsy();

    store.dispatch(
      updateDashCardsTimelineEventsVisibility(
        [DASHCARD_ID],
        (visibility, context) =>
          hideTimelineEvents(visibility, [eventA], context),
      ),
    );

    expect(getVisibleEventIds(store)).toEqual([eventB.id]);
    expect(getSavedVisibility(store)).toEqual({
      shown_timeline_ids: [timeline.id],
      hidden_event_ids: [eventA.id],
    });
    expect(getDashCardById(store.getState(), DASHCARD_ID).isDirty).toBe(true);
  });
});
