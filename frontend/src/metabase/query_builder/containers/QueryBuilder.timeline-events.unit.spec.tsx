import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTimelinesEndpoints } from "__support__/server-mocks";
import { act, screen, waitFor, within } from "__support__/ui";
import { getFetchedTimelines } from "metabase/timelines/panel/selectors";
import { checkNotNull } from "metabase/utils/types";
import { registerVisualizations } from "metabase/visualizations/register";
import type {
  Card,
  Timeline,
  TimelineEventsVisibility,
  UnsavedCard,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCollection,
  createMockDataset,
  createMockDatetimeColumn,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";

import { hideTimeline, showTimeline } from "../actions/timelines";
import { onOpenTimelines } from "../store/actions";
import {
  getIsDirty,
  getQuestion,
  getSubmittableQuestion,
  getVisibleTimelineEventIds,
} from "../store/selectors";

import {
  TEST_COLLECTION,
  TEST_TIME_SERIES_WITH_DATE_BREAKOUT_CARD,
  setup,
} from "./test-utils";

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
const ARCHIVED_EVENT = createMockTimelineEvent({
  id: 97,
  timeline_id: 1,
  name: "Cancelled launch",
  timestamp: "2025-06-03T00:00:00Z",
  archived: true,
});

const TIMELINE = createMockTimeline({
  id: 1,
  collection_id: CARD.collection_id,
  events: [RC1, RC2],
});

const WRITABLE_TIMELINE = createMockTimeline({
  ...TIMELINE,
  collection: createMockCollection({ id: "root", can_write: true }),
});

const GA = createMockTimelineEvent({
  id: 96,
  timeline_id: TIMELINE.id,
  name: "GA",
  timestamp: "2025-06-05T00:00:00Z",
});

const INCIDENT = createMockTimelineEvent({
  id: 42,
  timeline_id: 2,
  name: "Outage",
  timestamp: "2025-06-04T00:00:00Z",
});

const OTHER_COLLECTION_TIMELINE = createMockTimeline({
  id: 2,
  collection_id: TEST_COLLECTION.id,
  events: [INCIDENT],
});

const TIME_SERIES_DATASET = createMockDataset({
  data: {
    cols: [
      createMockDatetimeColumn({ name: "CREATED_AT", unit: "day" }),
      createMockNumericColumn({ name: "count" }),
    ],
    rows: [
      ["2025-06-01T00:00:00Z", 1],
      ["2025-06-02T00:00:00Z", 2],
    ],
  },
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

const setupWithTimelines = async ({
  visibility,
  timelines = [TIMELINE],
  card = createMockCard({
    ...CARD,
    visualization_settings: { ...CARD.visualization_settings, ...visibility },
  }),
}: {
  visibility?: TimelineEventsVisibility;
  timelines?: Timeline[];
  card?: Card | UnsavedCard;
} = {}) => {
  const { store } = await setup({ card, timelines });
  await waitFor(() => {
    expect(getFetchedTimelines(store.getState())).toHaveLength(
      timelines.length,
    );
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

  it("shows only the timelines of the question's collection", async () => {
    const store = await setupWithTimelines({
      timelines: [TIMELINE, OTHER_COLLECTION_TIMELINE],
    });

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("falls back to the root collection's timelines for an ad-hoc question", async () => {
    const store = await setupWithTimelines({
      card: createMockUnsavedCard({
        dataset_query: CARD.dataset_query,
        display: "line",
      }),
      timelines: [TIMELINE, OTHER_COLLECTION_TIMELINE],
    });

    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    });
  });

  it("offers the events button on a time series question", async () => {
    await setup({ card: CARD, dataset: TIME_SERIES_DATASET });

    expect(await screen.findByLabelText("calendar icon")).toBeInTheDocument();
  });

  it("does not offer the events button on a question that is not a time series", async () => {
    await setup({
      card: createMockCard({ ...CARD, display: "table" }),
      dataset: TIME_SERIES_DATASET,
    });

    await waitFor(() => {
      expect(screen.getByTestId("test-container")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText("calendar icon")).not.toBeInTheDocument();
  });

  it("never shows archived events", async () => {
    const store = await setupWithTimelines({
      timelines: [{ ...TIMELINE, events: [RC1, RC2, ARCHIVED_EVENT] }],
    });

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });

  it("shows only the events a saved question recorded", async () => {
    const store = await setupWithTimelines({
      visibility: {
        "timeline.selected_timeline_ids": [TIMELINE.id],
        "timeline.excluded_timeline_event_ids": [RC1.id],
      },
    });

    expect(getVisibleEventIds(store)).toEqual([RC2.id]);
  });

  it("shows nothing for a question saved with events turned off", async () => {
    const store = await setupWithTimelines({
      visibility: {
        "timeline.selected_timeline_ids": [],
        "timeline.excluded_timeline_event_ids": [],
      },
    });

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
    const store = await setupWithTimelines();

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

  it("shows just the event created from the sidebar", async () => {
    const store = await setupWithTimelines({
      visibility: {
        "timeline.selected_timeline_ids": [],
        "timeline.excluded_timeline_event_ids": [],
      },
      timelines: [WRITABLE_TIMELINE],
    });
    expect(getVisibleEventIds(store)).toEqual([]);

    fetchMock.post("path:/api/timeline-event", GA);
    setupTimelinesEndpoints([{ ...WRITABLE_TIMELINE, events: [RC1, RC2, GA] }]);

    await act(async () => {
      store.dispatch(onOpenTimelines());
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Create event" }),
    );
    await userEvent.type(await screen.findByLabelText("Event name"), GA.name);
    await userEvent.click(
      await screen.findByRole("button", { name: "Create" }),
    );

    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([GA.id]);
    });
    expect(getIsDirty(store.getState())).toBe(true);
  });

  it("re-showing a timeline keeps events outside the chart's range", async () => {
    const store = await setupWithTimelines({
      visibility: {
        "timeline.selected_timeline_ids": [],
        "timeline.excluded_timeline_event_ids": [],
      },
    });

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
});
