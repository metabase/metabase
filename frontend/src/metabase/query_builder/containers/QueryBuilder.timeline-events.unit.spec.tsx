import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { getTimelineEventCheckbox } from "__support__/timelines";
import { act, waitFor } from "__support__/ui";
import { getFetchedTimelines } from "metabase/timelines/panel/selectors";
import { checkNotNull } from "metabase/utils/types";
import {
  hideTimelines,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import { registerVisualizations } from "metabase/visualizations/register";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import type { Card, TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockCard,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";

import {
  openTimelines,
  updateTimelineEventsVisibility,
} from "../actions/timelines";
import { onOpenTimelines } from "../store/actions";
import {
  getIsDirty,
  getQuestion,
  getSubmittableQuestion,
  getVisibleTimelineEventIds,
} from "../store/selectors";

import {
  TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  saveQuestion,
  setup,
  triggerVisualizationQueryChange,
} from "./test-utils";

registerVisualizations();

const { trackSimpleEvent } = jest.requireMock("metabase/analytics");

const CARD = createMockCard({
  ...TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  display: "line",
  visualization_settings: { "graph.show_values": true },
});

const RC1 = createMockTimelineEvent({
  id: 99,
  timeline_id: 1,
  name: "RC1",
  timestamp: "2025-06-01T00:00:00Z",
});
const RC2 = createMockTimelineEvent({
  id: 98,
  timeline_id: 1,
  name: "RC2",
  timestamp: "2025-06-02T00:00:00Z",
});

const EVENTS_OFF: TimelineEventsVisibility = {
  "timeline.selected_timeline_ids": [],
  "timeline.excluded_timeline_event_ids": [],
};

const TIMELINE = createMockTimeline({
  id: 1,
  collection_id: CARD.collection_id,
  events: [RC1, RC2],
});

type Store = Awaited<ReturnType<typeof setup>>["store"];

const getVisibleEventIds = (store: Store) =>
  getVisibleTimelineEventIds(store.getState());

const updateVisibility = (
  store: Store,
  update: TimelineEventsVisibilityUpdate,
) =>
  act(async () => {
    store.dispatch(updateTimelineEventsVisibility(update));
  });

const getSavedSettings = () => {
  const body = checkNotNull(
    fetchMock.callHistory.lastCall(`path:/api/card/${CARD.id}`, {
      method: "PUT",
    })?.options.body,
  );
  const card: Card = JSON.parse(body.toString());
  return card.visualization_settings;
};

const setupWithTimelines = async (visibility?: TimelineEventsVisibility) => {
  const { store } = await setup({
    card: createMockCard({
      ...CARD,
      visualization_settings: { ...CARD.visualization_settings, ...visibility },
    }),
    timelines: [TIMELINE],
  });
  await waitFor(() => {
    expect(getFetchedTimelines(store.getState())).toHaveLength(1);
  });
  return store;
};

describe("QueryBuilder > timeline events", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("shows the collection's events for a question that never recorded any", async () => {
    const store = await setupWithTimelines();

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("shows root-collection events for an ad-hoc question", async () => {
    const { store } = await setup({
      card: createMockUnsavedCard({
        dataset_query: CARD.dataset_query,
        display: "line",
      }),
      timelines: [
        createMockTimeline({ ...TIMELINE, collection_id: null }),
        createMockTimeline({
          id: 2,
          collection_id: 123,
          events: [createMockTimelineEvent({ ...RC1, id: 97, timeline_id: 2 })],
        }),
      ],
    });

    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    });
    expect(
      checkNotNull(getQuestion(store.getState())).settings(),
    ).not.toHaveProperty("timeline.selected_timeline_ids");
  });

  it("shows only the events a saved question recorded", async () => {
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
      "timeline.excluded_timeline_event_ids": [RC1.id],
    });

    expect(getVisibleEventIds(store)).toEqual([RC2.id]);
  });

  it("shows nothing for a question saved with events turned off", async () => {
    const store = await setupWithTimelines(EVENTS_OFF);

    expect(getVisibleEventIds(store)).toEqual([]);
  });

  it("hiding an event records the selection on the question", async () => {
    const store = await setupWithTimelines();
    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);

    // The footer's Events button only renders for time series results.
    await act(async () => {
      store.dispatch(onOpenTimelines());
    });
    await userEvent.click(getTimelineEventCheckbox("RC1"));

    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([RC2.id]);
    });
    expect(checkNotNull(getQuestion(store.getState())).settings()).toEqual(
      expect.objectContaining({
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [RC1.id],
      }),
    );
    expect(getIsDirty(store.getState())).toBe(true);

    await saveQuestion();

    expect(await getSavedSettings()).toEqual(
      expect.objectContaining({
        "graph.show_values": true,
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [RC1.id],
      }),
    );
  });

  it("saving without touching events records nothing, so dashcards show none", async () => {
    const store = await setupWithTimelines();
    const state = store.getState();

    const question = getSubmittableQuestion(
      state,
      checkNotNull(getQuestion(state)),
    );

    expect(question.settings()).not.toHaveProperty(
      "timeline.selected_timeline_ids",
    );
  });

  it("saving after turning events on records them", async () => {
    const store = await setupWithTimelines(EVENTS_OFF);

    await updateVisibility(store, (visibility, timelines) =>
      showTimelines(visibility, [TIMELINE.id], timelines),
    );
    const state = store.getState();

    const question = getSubmittableQuestion(
      state,
      checkNotNull(getQuestion(state)),
    );

    expect(question.settings()).toEqual(
      expect.objectContaining({
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [],
      }),
    );
  });

  it("saving after turning events off records the absence", async () => {
    const store = await setupWithTimelines();

    await updateVisibility(store, (visibility, timelines) =>
      hideTimelines(visibility, [TIMELINE.id], timelines),
    );
    const state = store.getState();

    const question = getSubmittableQuestion(
      state,
      checkNotNull(getQuestion(state)),
    );

    expect(question.settings()).toEqual(
      expect.objectContaining({
        "timeline.selected_timeline_ids": [],
        "timeline.excluded_timeline_event_ids": [],
      }),
    );
  });

  it("opening the events panel from the chart tracks where it was opened from", async () => {
    const store = await setupWithTimelines();

    await act(async () => {
      store.dispatch(openTimelines("chart", [RC1.id]));
    });

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "question_events_panel_opened",
      triggered_from: "chart",
    });
  });

  it("focusing events while the panel is already open does not track another opening", async () => {
    const store = await setupWithTimelines();
    await act(async () => {
      store.dispatch(openTimelines("footer"));
    });
    trackSimpleEvent.mockClear();

    await act(async () => {
      store.dispatch(openTimelines("chart", [RC1.id]));
    });

    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("saving a question with a recorded selection tracks it", async () => {
    const store = await setupWithTimelines();

    await updateVisibility(store, (visibility, timelines) =>
      hideTimelines(visibility, [TIMELINE.id], timelines),
    );
    await saveQuestion();

    expect(await getSavedSettings()).toEqual(
      expect.objectContaining(EVENTS_OFF),
    );

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "question_timeline_events_saved",
      target_id: CARD.id,
    });
  });

  it("saving other changes preserves recorded events without tracking an event change", async () => {
    const savedVisibility = {
      "timeline.selected_timeline_ids": [TIMELINE.id],
      "timeline.excluded_timeline_event_ids": [RC1.id],
    };
    await setupWithTimelines(savedVisibility);

    await triggerVisualizationQueryChange();
    await saveQuestion();

    expect(await getSavedSettings()).toEqual(
      expect.objectContaining(savedVisibility),
    );
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("saving unrelated changes does not record collection-default events or track an event change", async () => {
    await setupWithTimelines();

    await triggerVisualizationQueryChange();
    await saveQuestion();

    const settings = await getSavedSettings();
    expect(settings).not.toHaveProperty("timeline.selected_timeline_ids");
    expect(settings).not.toHaveProperty("timeline.excluded_timeline_event_ids");
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("re-showing a timeline keeps events outside the chart's range", async () => {
    const store = await setupWithTimelines(EVENTS_OFF);

    await updateVisibility(store, (visibility, timelines) =>
      showTimelines(visibility, [TIMELINE.id], timelines),
    );

    expect(
      checkNotNull(getQuestion(store.getState())).settings()[
        "timeline.excluded_timeline_event_ids"
      ],
    ).toEqual([]);
    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("creating an event on a timeline that is already shown records nothing", async () => {
    const store = await setupWithTimelines();

    await updateVisibility(store, (visibility, timelines) =>
      showTimelineEvents(visibility, [RC1], timelines),
    );

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    expect(
      checkNotNull(getQuestion(store.getState())).settings(),
    ).not.toHaveProperty("timeline.selected_timeline_ids");
    expect(getIsDirty(store.getState())).toBe(false);
  });

  it("shows an event created on a timeline that has not been fetched yet", async () => {
    const store = await setupWithTimelines();
    const firstEvent = createMockTimelineEvent({
      id: 97,
      timeline_id: 2,
      timestamp: "2025-06-03T00:00:00Z",
    });

    await updateVisibility(store, (visibility, timelines) =>
      showTimelineEvents(visibility, [firstEvent], timelines),
    );

    expect(checkNotNull(getQuestion(store.getState())).settings()).toEqual(
      expect.objectContaining({
        "timeline.selected_timeline_ids": [TIMELINE.id, 2],
        "timeline.excluded_timeline_event_ids": [],
      }),
    );
  });
});
