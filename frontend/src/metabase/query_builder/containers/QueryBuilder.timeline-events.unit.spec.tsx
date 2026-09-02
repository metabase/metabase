import userEvent from "@testing-library/user-event";

import { act, screen, waitFor, within } from "__support__/ui";
import { getFetchedTimelines } from "metabase/timelines/panel/selectors";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type { TimelineEventsVisibility } from "metabase-types/api";
import {
  createMockCard,
  createMockTimeline,
  createMockTimelineEvent,
} from "metabase-types/api/mocks";

import {
  hideTimeline,
  showCreatedTimelineEvent,
  showTimeline,
  showTimelineEvents,
} from "../actions/timelines";
import { onOpenTimelines } from "../store/actions";
import {
  getIsDirty,
  getQuestion,
  getSubmittableQuestion,
  getVisibleTimelineEventIds,
} from "../store/selectors";

import { TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD, setup } from "./test-utils";

registerVisualizations();

const CARD = createMockCard({
  ...TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  display: "line",
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

const getEventCard = (eventName: string) =>
  checkNotNull(
    screen
      .getAllByLabelText("Timeline event card")
      .find((card) => within(card).queryByText(eventName) != null),
  );

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
  it("shows the collection's events when the timelines resolve after the question loads (GHY-3839)", async () => {
    // Delay /api/timeline so it resolves after the question has loaded.
    const { store } = await setup({
      card: CARD,
      timelines: [TIMELINE],
      timelinesDelay: 200,
    });

    // If this fails, bump the delay — otherwise the late resolve isn't exercised.
    expect(getFetchedTimelines(store.getState())).toHaveLength(0);
    expect(getVisibleEventIds(store)).toHaveLength(0);

    await waitFor(() => {
      expect(getFetchedTimelines(store.getState())).toHaveLength(1);
    });

    await waitFor(
      () => {
        // Reading the DOM forces testing-library to flush React's pending
        // re-render from the late timelines resolve (queryByTestId, so it
        // doesn't throw if the chart subtree errored out under jsdom).
        screen.queryByTestId("test-container");
        expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
      },
      { timeout: 5000 },
    );
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
    await userEvent.click(within(getEventCard("RC1")).getByRole("checkbox"));

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

    await act(async () => {
      store.dispatch(showTimeline(TIMELINE));
    });
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

    await act(async () => {
      store.dispatch(hideTimeline(TIMELINE));
    });
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

  it("re-showing a timeline keeps events outside the chart's range", async () => {
    const store = await setupWithTimelines(EVENTS_OFF);

    await act(async () => {
      store.dispatch(showTimeline(TIMELINE));
    });

    expect(
      checkNotNull(getQuestion(store.getState())).settings()[
        "timeline.excluded_timeline_event_ids"
      ],
    ).toEqual([]);
    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("creating an event on a timeline that is already shown records nothing", async () => {
    const store = await setupWithTimelines();

    await act(async () => {
      store.dispatch(showTimelineEvents([RC1]));
    });

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    expect(
      checkNotNull(getQuestion(store.getState())).settings(),
    ).not.toHaveProperty("timeline.selected_timeline_ids");
    expect(getIsDirty(store.getState())).toBe(false);
  });

  it("creating an event on a hidden timeline shows the whole timeline", async () => {
    const store = await setupWithTimelines(EVENTS_OFF);
    const created = createMockTimelineEvent({
      id: 97,
      timeline_id: TIMELINE.id,
      timestamp: "2025-06-03T00:00:00Z",
    });

    await act(async () => {
      store.dispatch(showCreatedTimelineEvent(created));
    });

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("shows an event created on a timeline that has not been fetched yet", async () => {
    const store = await setupWithTimelines();
    const firstEvent = createMockTimelineEvent({
      id: 97,
      timeline_id: 2,
      timestamp: "2025-06-03T00:00:00Z",
    });

    await act(async () => {
      store.dispatch(showTimelineEvents([firstEvent]));
    });

    expect(checkNotNull(getQuestion(store.getState())).settings()).toEqual(
      expect.objectContaining({
        "timeline.selected_timeline_ids": [TIMELINE.id, 2],
        "timeline.excluded_timeline_event_ids": [],
      }),
    );
  });
});
