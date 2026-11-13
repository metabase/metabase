import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCardCreateEndpoint,
  setupCardEndpoints,
} from "__support__/server-mocks";
import {
  getTimelineCheckbox,
  getTimelineEventCheckbox,
} from "__support__/timelines";
import {
  act,
  mockGetBoundingClientRect,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { dayjs } from "metabase/dayjs";
import { getFetchedTimelines } from "metabase/timelines/panel/selectors";
import { checkNotNull } from "metabase/utils/types";
import {
  hideTimelines,
  showTimelineEvents,
  showTimelines,
} from "metabase/visualizations/lib/timeline-events-visibility";
import { registerVisualizations } from "metabase/visualizations/register";
import type { TimelineEventsVisibilityUpdate } from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  Card,
  CardId,
  TemporalUnit,
  Timeline,
  TimelineEvent,
  TimelineEventsVisibility,
  TimelineId,
} from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
  createMockCollection,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNumericColumn,
  createMockTimeline,
  createMockTimelineEvent,
  createMockUnsavedCard,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createOrdersCreatedAtDatasetColumn,
  createOrdersTotalDatasetColumn,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { apiCreateQuestion, updateQuestion } from "../actions";
import {
  openTimelines,
  updateTimelineEventsVisibility,
} from "../actions/timelines";
import { onOpenTimelines } from "../store/actions";
import {
  getIsDirty,
  getOriginalQuestion,
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

const setupAdHocWithTimelines = async () => {
  const { store } = await setup({
    card: createMockUnsavedCard({
      dataset_query: CARD.dataset_query,
      display: "line",
    }),
    timelines: [createMockTimeline({ ...TIMELINE, collection_id: null })],
  });
  await waitFor(() => {
    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
  });
  return store;
};

const DESTINATION_COLLECTION = createMockCollection({ id: 123 });

const setupNewQuestion = async ({
  originalCardId,
  ...options
}: Pick<Parameters<typeof setup>[0], "timelines" | "timelinesResponse"> & {
  originalCardId?: CardId;
}) => {
  setupCardCreateEndpoint();
  fetchMock.get(
    /\/api\/card\/\d+\/query_metadata/,
    createMockCardQueryMetadata(),
  );
  const { store } = await setup({
    card: createMockUnsavedCard({
      dataset_query: CARD.dataset_query,
      display: "line",
      original_card_id: originalCardId,
    }),
    ...options,
  });
  return store;
};

const getCreatedCard = (): Card => {
  const body = checkNotNull(
    fetchMock.callHistory.lastCall("path:/api/card", { method: "POST" })
      ?.options.body,
  );
  return JSON.parse(body.toString());
};

const saveNewQuestion = async (
  options: Pick<Parameters<typeof setup>[0], "timelines" | "timelinesResponse">,
) => {
  const store = await setupNewQuestion(options);
  const question = checkNotNull(getQuestion(store.getState())).setCollectionId(
    DESTINATION_COLLECTION.id,
  );
  await act(async () => {
    await store.dispatch(apiCreateQuestion(question));
  });
  return getCreatedCard();
};

describe("QueryBuilder > timeline events", () => {
  beforeEach(() => {
    trackSimpleEvent.mockClear();
  });

  it("shows no events for a saved question that never recorded any", async () => {
    const store = await setupWithTimelines();

    expect(getVisibleEventIds(store)).toEqual([]);
  });

  it("shows no events after editing the query of a saved question that never recorded any", async () => {
    const store = await setupWithTimelines();

    await triggerVisualizationQueryChange();

    await waitFor(() => {
      expect(getIsDirty(store.getState())).toBe(true);
    });
    expect(getVisibleEventIds(store)).toEqual([]);
  });

  it("saving a copy of a saved question without recorded events keeps them off", async () => {
    const store = await setupWithTimelines();
    const question = checkNotNull(getQuestion(store.getState()));

    await act(async () => {
      await store.dispatch(
        apiCreateQuestion(question, {
          sourceCardId: CARD.id,
          sourceQuestion: getOriginalQuestion(store.getState()),
        }),
      );
    });

    expect(getCreatedCard().visualization_settings).toMatchObject(EVENTS_OFF);
  });

  it("saving an edited copy of a saved question without recorded events keeps them off", async () => {
    const store = await setupWithTimelines();

    await triggerVisualizationQueryChange();
    await waitFor(() => {
      expect(getIsDirty(store.getState())).toBe(true);
    });
    const question = checkNotNull(getQuestion(store.getState()));

    await act(async () => {
      await store.dispatch(
        apiCreateQuestion(question, {
          sourceCardId: CARD.id,
          sourceQuestion: getOriginalQuestion(store.getState()),
        }),
      );
    });

    expect(getCreatedCard().visualization_settings).toMatchObject(EVENTS_OFF);
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
    ).not.toHaveProperty(["timeline.selected_timeline_ids"]);
  });

  it.each([
    { source: "model", type: "model" as const, display: "table" as const },
    {
      source: "table question",
      type: "question" as const,
      display: "table" as const,
    },
  ])(
    "a time-series chart explored from a saved $source shows and records collection events",
    async ({ type, display }) => {
      const sourceCard = createMockCard({
        id: 2,
        type,
        display,
        dataset_query: CARD.dataset_query,
      });
      setupCardEndpoints(sourceCard);
      const store = await setupNewQuestion({
        originalCardId: sourceCard.id,
        timelines: [createMockTimeline({ ...TIMELINE, collection_id: null })],
      });

      await waitFor(() => {
        expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
      });

      const question = checkNotNull(getQuestion(store.getState()));
      await act(async () => {
        await store.dispatch(
          apiCreateQuestion(question, {
            sourceCardId: sourceCard.id,
            sourceQuestion: getOriginalQuestion(store.getState()),
          }),
        );
      });

      expect(getCreatedCard().visualization_settings).toMatchObject({
        "timeline.selected_timeline_ids": [TIMELINE.id],
      });
    },
  );

  it("waits for collection timelines before saving a new question", async () => {
    let resolveTimelines: (timelines: (typeof TIMELINE)[]) => void = () => {};
    const timelinesResponse = new Promise<(typeof TIMELINE)[]>((resolve) => {
      resolveTimelines = resolve;
    });
    const destinationTimeline = createMockTimeline({
      id: 2,
      collection_id: DESTINATION_COLLECTION.id,
      collection: DESTINATION_COLLECTION,
      events: [createMockTimelineEvent({ ...RC1, id: 97, timeline_id: 2 })],
    });
    const store = await setupNewQuestion({
      timelinesResponse: () => timelinesResponse,
    });
    const question = checkNotNull(
      getQuestion(store.getState()),
    ).setCollectionId(checkNotNull(DESTINATION_COLLECTION.entity_id));

    // The save cannot be awaited yet, because the card POST must be inspected
    // while the timelines request is still in flight.
    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = store.dispatch(apiCreateQuestion(question));
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/timeline")).toBe(true);
    });
    const createCallBeforeTimelinesLoaded = fetchMock.callHistory.lastCall(
      "path:/api/card",
      { method: "POST" },
    );

    resolveTimelines([destinationTimeline]);
    await act(async () => {
      await savePromise;
    });

    expect(createCallBeforeTimelinesLoaded).toBeUndefined();
    expect(getCreatedCard().visualization_settings).toMatchObject({
      "timeline.selected_timeline_ids": [destinationTimeline.id],
    });
  });

  it("a new question saved after another one still records its collection's timelines", async () => {
    const destinationTimeline = createMockTimeline({
      id: 2,
      collection_id: DESTINATION_COLLECTION.id,
      collection: DESTINATION_COLLECTION,
      events: [createMockTimelineEvent({ ...RC1, id: 97, timeline_id: 2 })],
    });
    const store = await setupNewQuestion({ timelines: [destinationTimeline] });
    const question = checkNotNull(
      getQuestion(store.getState()),
    ).setCollectionId(DESTINATION_COLLECTION.id);

    await act(async () => {
      await store.dispatch(apiCreateQuestion(question));
    });
    await act(async () => {
      await store.dispatch(apiCreateQuestion(question));
    });

    expect(getCreatedCard().visualization_settings).toMatchObject({
      "timeline.selected_timeline_ids": [destinationTimeline.id],
    });
  });

  it("records an explicit empty selection when saving into a collection with no timelines", async () => {
    const created = await saveNewQuestion({ timelines: [TIMELINE] });

    expect(created.visualization_settings).toMatchObject(EVENTS_OFF);
    expect(created).not.toHaveProperty("source_card_id");
  });

  it("records no selection when collection timelines fail to load", async () => {
    const created = await saveNewQuestion({
      timelinesResponse: () => Promise.reject(new Error("unavailable")),
    });

    expect(created.visualization_settings).not.toHaveProperty([
      "timeline.selected_timeline_ids",
    ]);
    expect(created.visualization_settings).not.toHaveProperty([
      "timeline.excluded_timeline_event_ids",
    ]);
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
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });
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

  it("saving after turning events off records the absence", async () => {
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });

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
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });

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
    expect(settings).not.toHaveProperty(["timeline.selected_timeline_ids"]);
    expect(settings).not.toHaveProperty([
      "timeline.excluded_timeline_event_ids",
    ]);
    expect(trackSimpleEvent).not.toHaveBeenCalled();
  });

  it("turning a saved table into a time-series chart and replacing it keeps the collection events it shows", async () => {
    const { store } = await setup({
      card: createMockCard({ ...CARD, display: "table" }),
      timelines: [TIMELINE],
    });

    await act(async () => {
      await store.dispatch(
        updateQuestion(
          checkNotNull(getQuestion(store.getState())).setDisplay("line"),
        ),
      );
    });
    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    });
    await saveQuestion();

    expect(await getSavedSettings()).toMatchObject({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });
    await waitFor(() => {
      expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    });
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
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });

    await updateVisibility(store, (visibility, timelines) =>
      showTimelineEvents(visibility, [RC1], timelines),
    );

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    expect(
      checkNotNull(getQuestion(store.getState())).settings(),
    ).toMatchObject({ "timeline.selected_timeline_ids": [TIMELINE.id] });
    expect(getIsDirty(store.getState())).toBe(false);
  });

  it("shows an event created on a timeline that has not been fetched yet", async () => {
    const store = await setupWithTimelines({
      "timeline.selected_timeline_ids": [TIMELINE.id],
    });
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

  it("creating an event on a timeline an ad-hoc question already shows records nothing", async () => {
    const store = await setupAdHocWithTimelines();

    await updateVisibility(store, (visibility, timelines) =>
      showTimelineEvents(visibility, [RC1], timelines),
    );

    expect(getVisibleEventIds(store)).toEqual([RC1.id, RC2.id]);
    expect(
      checkNotNull(getQuestion(store.getState())).settings(),
    ).not.toHaveProperty(["timeline.selected_timeline_ids"]);
  });

  it("shows an event created on a timeline that has not been fetched yet for an ad-hoc question", async () => {
    const store = await setupAdHocWithTimelines();
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

const ROOT = createMockCollection({ ...ROOT_COLLECTION, can_write: true });
const READ_ONLY_ROOT = createMockCollection({
  ...ROOT_COLLECTION,
  can_write: false,
});

const YEARS = ["2025", "2026", "2027", "2028", "2029"];

const createCountByCreatedAtCard = (
  unit: TemporalUnit,
  opts: Partial<Card> = {},
) =>
  createMockCard({
    id: 7,
    name: `Orders by ${unit}`,
    display: "line",
    dataset_query: Lib.toJsQuery(
      Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [{ type: "operator", operator: "count", args: [] }],
            breakouts: [{ type: "column", name: "CREATED_AT", unit }],
          },
        ],
      }),
    ),
    ...opts,
  });

const COUNT_COLUMN = createMockNumericColumn({
  name: "count",
  display_name: "Count",
  source: "aggregation",
  field_ref: ["aggregation", 0],
});

const createCountByCreatedAtDataset = (unit: TemporalUnit, dates: string[]) =>
  createMockDataset({
    data: createMockDatasetData({
      cols: [
        createOrdersCreatedAtDatasetColumn({
          source: "breakout",
          unit,
          // the name the query processor gives a column grouped by a unit
          display_name: `Created At: ${unit.charAt(0).toUpperCase()}${unit.slice(1)}`,
          field_ref: ["field", ORDERS.CREATED_AT, { "temporal-unit": unit }],
        }),
        COUNT_COLUMN,
      ],
      rows: dates.map((date, index) => [`${date}T00:00:00Z`, (index + 1) * 10]),
    }),
  });

const YEARLY_DATASET = createCountByCreatedAtDataset(
  "year",
  YEARS.map((year) => `${year}-01-01`),
);

const getMonths = (from: string, count: number) =>
  Array.from({ length: count }, (_, index) =>
    dayjs.utc(from).add(index, "month").format("YYYY-MM-DD"),
  );

const MONTHLY_DATASET = createCountByCreatedAtDataset(
  "month",
  getMonths("2025-01-01", 52),
);

let nextFakeId = 500;

const createEvent = (
  timelineId: TimelineId,
  opts: Partial<TimelineEvent>,
): TimelineEvent =>
  createMockTimelineEvent({
    id: nextFakeId++,
    timeline_id: timelineId,
    ...opts,
  });

const createTimeline = (
  opts: Partial<Timeline> & { name: string },
  events: Partial<TimelineEvent>[] = [],
): Timeline => {
  const id = opts.id ?? nextFakeId++;
  const collection = opts.collection ?? ROOT;
  return createMockTimeline({
    id,
    collection_id: null,
    collection,
    ...opts,
    events: events.map((event) => createEvent(id, event)),
  });
};

/**
 * Stands in for the timeline API. Each request reads and changes the same
 * list of timelines, so the data the page shows after a write is the data
 * the write handler stored.
 */
const setupTimelineBackend = (initialTimelines: Timeline[]) => {
  let timelines = initialTimelines.map(({ events = [], ...timeline }) => ({
    ...timeline,
    events: [...events],
  }));
  const findEvent = (id: number) =>
    timelines.flatMap((timeline) => timeline.events).find((e) => e.id === id);

  fetchMock.get("path:/api/timeline", (call) => {
    const includeEvents =
      new URL(call.url).searchParams.get("include") === "events";
    return timelines.map(({ events, ...timeline }) =>
      includeEvents
        ? { ...timeline, events: events.filter((event) => !event.archived) }
        : timeline,
    );
  });

  fetchMock.post("path:/api/timeline", (call) => {
    const body = JSON.parse(String(call.options.body));
    const timeline = {
      ...createMockTimeline({ ...body, id: nextFakeId++ }),
      collection: ROOT,
      events: [],
    };
    timelines = [...timelines, timeline];
    return timeline;
  });

  fetchMock.post("path:/api/timeline-event", (call) => {
    const body = JSON.parse(String(call.options.body));
    const timeline = timelines.find(({ id }) => id === body.timeline_id);
    if (timeline == null) {
      return { status: 404 };
    }
    const event = createEvent(timeline.id, body);
    timeline.events = [...timeline.events, event];
    return event;
  });

  fetchMock.get(/\/api\/timeline-event\/\d+$/, (call) => {
    const id = Number(new URL(call.url).pathname.split("/").pop());
    return findEvent(id) ?? { status: 404 };
  });

  fetchMock.put(/\/api\/timeline-event\/\d+$/, (call) => {
    const id = Number(new URL(call.url).pathname.split("/").pop());
    const changes = JSON.parse(String(call.options.body));
    const event = findEvent(id);
    if (event == null) {
      return { status: 404 };
    }
    const updated = { ...event, ...changes };
    timelines = timelines.map((timeline) => ({
      ...timeline,
      events: [
        ...timeline.events.filter((e) => e.id !== id),
        ...(timeline.id === updated.timeline_id ? [updated] : []),
      ],
    }));
    return updated;
  });
};

/** The API answers a card update with the whole card, including its id. */
const setupCardUpdateEndpoint = (card: Card) => {
  fetchMock.put(`path:/api/card/${card.id}`, (call) => ({
    ...card,
    ...JSON.parse(String(call.options.body)),
    id: card.id,
  }));
};

const getRequestBodies = (method: "POST" | "PUT", path: string | RegExp) =>
  fetchMock.callHistory
    .calls(typeof path === "string" ? `path:${path}` : path, { method })
    .map((call) => JSON.parse(String(call.options.body)));

const getChart = () => screen.getByTestId("chart-container");

const queryEventChip = (name: string) =>
  screen
    .queryAllByTestId("timeline-event-chip")
    .find((chip) => chip.getAttribute("aria-label") === name) ?? null;

const findEventChip = (name: string) =>
  waitFor(() => {
    const chip = queryEventChip(name);
    if (chip == null) {
      throw new Error(`There is no event chip named "${name}"`);
    }
    return chip;
  });

// brand (#509EE3) as ECharts writes the fill of an emphasized data point
const HIGHLIGHTED_POINT_FILL = "rgb(80,158,227)";

const getChartPaths = () =>
  // eslint-disable-next-line testing-library/no-node-access -- ECharts draws the marker line and the data points as SVG paths, with no role or label
  Array.from(getChart().querySelectorAll("path"));

const getSeriesPointXs = () => {
  const seriesLine = checkNotNull(
    getChartPaths().find(
      (path) =>
        path.getAttribute("stroke-width") === "2" &&
        path.getAttribute("stroke-linejoin") === "bevel" &&
        path.getAttribute("d"),
    ),
  );
  return Array.from(
    checkNotNull(seriesLine.getAttribute("d")).matchAll(/[ML]([\d.]+) /g),
    (match) => Number(match[1]),
  );
};

// the marker line is drawn as a vertical "M x y1 L x y2" path
const getMarkerLineXs = () =>
  getChartPaths().flatMap((path) => {
    const match = path
      .getAttribute("d")
      ?.match(/^M([\d.]+) [\d.]+L([\d.]+) [\d.]+$/);
    return path.getAttribute("stroke-width") === "2" &&
      match != null &&
      match[1] === match[2]
      ? [Number(match[1])]
      : [];
  });

const getHighlightedPointXs = () =>
  getChartPaths()
    .filter((path) => path.getAttribute("fill") === HIGHLIGHTED_POINT_FILL)
    .map((path) =>
      Number(path.getAttribute("transform")?.match(/,([\d.]+),[\d.]+\)$/)?.[1]),
    );

const getSidebar = () => screen.getByTestId("sidebar-content");

const openEventsPanel = async () => {
  await userEvent.click(
    within(screen.getByTestId("view-footer")).getByLabelText("calendar icon"),
  );
  return screen.findByTestId("sidebar-content");
};

const typeDate = async (input: HTMLElement, date: string) => {
  await userEvent.clear(input);
  await userEvent.type(input, date);
};

const createEventFromPanel = async (name: string, date: string) => {
  await userEvent.click(
    within(getSidebar()).getByRole("button", { name: "Create event" }),
  );
  const modal = await screen.findByRole("dialog");
  await userEvent.type(within(modal).getByLabelText("Event name"), name);
  await typeDate(within(modal).getByLabelText("Date"), date);
  await userEvent.click(within(modal).getByRole("button", { name: "Create" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  expect(await within(getSidebar()).findByText(name)).toBeInTheDocument();
};

const openEventMenu = async (eventName: string) => {
  const card = await waitFor(() =>
    checkNotNull(
      within(getSidebar())
        .getAllByLabelText("Timeline event card")
        .find((card) => within(card).queryByText(eventName) != null),
    ),
  );
  await userEvent.click(within(card).getByLabelText("Event menu"));
  return screen.findByRole("menu");
};

describe("QueryBuilder > timeline events on the chart and in the events panel", () => {
  beforeEach(() => {
    // the event chips are placed from the chart's size
    mockGetBoundingClientRect({ width: 1000, height: 600 });
    trackSimpleEvent.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates an event in the existing timeline, not a new default one", async () => {
    setupTimelineBackend([
      createTimeline({ id: 2, name: "Releases" }, [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
      withUndos: true,
    });

    await openEventsPanel();
    await userEvent.click(
      within(getSidebar()).getByRole("button", { name: "Create event" }),
    );
    const modal = await screen.findByRole("dialog");
    await userEvent.type(within(modal).getByLabelText("Event name"), "RC2");
    await typeDate(within(modal).getByLabelText("Date"), "10/30/2027");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Create" }),
    );

    await waitFor(() => {
      expect(getRequestBodies("POST", "/api/timeline-event")).toHaveLength(1);
    });
    expect(getRequestBodies("POST", "/api/timeline")).toEqual([]);
    expect(getRequestBodies("POST", "/api/timeline-event")).toEqual([
      expect.objectContaining({
        name: "RC2",
        timeline_id: 2,
        timestamp: expect.stringMatching(/^2027-10-30/),
      }),
    ]);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await within(getSidebar()).findByText("RC2")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("Releases")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("RC1")).toBeInTheDocument();
  });

  it("lists only the events in the chart's range, and every event in the data view", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "v1", timestamp: "2030-01-01T00:00:00Z" },
        { name: "v2", timestamp: "2026-01-01T00:00:00Z" },
        { name: "v3", timestamp: "2029-01-01T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
    });

    const sidebar = await openEventsPanel();
    expect(await within(sidebar).findByText("v2")).toBeInTheDocument();
    expect(within(sidebar).getByText("v3")).toBeInTheDocument();
    expect(within(sidebar).queryByText("v1")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Switch to data"));

    expect(await within(getSidebar()).findByText("v1")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("v2")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("v3")).toBeInTheDocument();
  });

  it("edits an event from the events panel", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { id: 31, name: "RC0", timestamp: "2026-10-20T00:00:00Z" },
        { id: 32, name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
      withUndos: true,
    });

    await openEventsPanel();
    const menu = await openEventMenu("RC1");
    await userEvent.click(within(menu).getByText("Edit event"));
    const modal = await screen.findByRole("dialog");
    const nameInput = await within(modal).findByLabelText("Event name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "RC2");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Update" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(getRequestBodies("PUT", /\/api\/timeline-event\/31$/)).toEqual([]);
    expect(getRequestBodies("PUT", /\/api\/timeline-event\/32$/)).toEqual([
      expect.objectContaining({
        name: "RC2",
        timestamp: "2027-10-20T00:00:00Z",
      }),
    ]);
    await waitFor(() => {
      expect(within(getSidebar()).queryByText("RC1")).not.toBeInTheDocument();
    });
    expect(within(getSidebar()).getByText("RC2")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("RC0")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("Releases")).toBeInTheDocument();
  });

  it("moves an event to another timeline from the events panel", async () => {
    setupTimelineBackend([
      createTimeline({ id: 41, name: "Releases" }),
      createTimeline({ id: 42, name: "Archive" }),
      createTimeline({ id: 43, name: "Builds" }, [
        { id: 44, name: "RC2", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
      withUndos: true,
    });

    await openEventsPanel();
    expect(await within(getSidebar()).findByText("Builds")).toBeInTheDocument();
    const menu = await openEventMenu("RC2");
    await userEvent.click(within(menu).getByText("Move event"));
    const modal = await screen.findByRole("dialog");
    await userEvent.click(await within(modal).findByText("Releases"));
    await userEvent.click(within(modal).getByRole("button", { name: "Move" }));

    await waitFor(() => {
      expect(getRequestBodies("PUT", /\/api\/timeline-event\/44$/)).toEqual([
        { timeline_id: 41 },
      ]);
    });
    await waitFor(() => {
      expect(
        within(getSidebar()).queryByText("Builds"),
      ).not.toBeInTheDocument();
    });
    expect(within(getSidebar()).getByText("Releases")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("RC2")).toBeInTheDocument();
  });

  it("archives an event from the events panel and restores it with undo", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { id: 51, name: "RC0", timestamp: "2026-10-20T00:00:00Z" },
        { id: 52, name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
      withUndos: true,
    });

    await openEventsPanel();
    const menu = await openEventMenu("RC1");
    await userEvent.click(within(menu).getByText("Archive event"));

    await waitFor(() => {
      expect(within(getSidebar()).queryByText("RC1")).not.toBeInTheDocument();
    });
    expect(getRequestBodies("PUT", /\/api\/timeline-event\/52$/)).toEqual([
      { archived: true },
    ]);
    expect(within(getSidebar()).getByText("RC0")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await within(getSidebar()).findByText("RC1")).toBeInTheDocument();
    expect(getRequestBodies("PUT", /\/api\/timeline-event\/52$/)).toEqual([
      { archived: true },
      { archived: false },
    ]);
  });

  it("shows a single-event popover, a marker line and the closest data point while an event is hovered", async () => {
    const releases = createTimeline({ name: "Releases" }, [
      { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "star" },
    ]);
    setupTimelineBackend([releases]);
    await setup({
      card: createCountByCreatedAtCard("year", {
        visualization_settings: {
          "timeline.selected_timeline_ids": [releases.id],
        },
      }),
      dataset: YEARLY_DATASET,
    });

    const chip = await findEventChip("RC1");
    expect(getMarkerLineXs()).toEqual([]);
    expect(getHighlightedPointXs()).toEqual([]);

    await userEvent.hover(chip);

    const popover = await screen.findByTestId("timeline-event-popover");
    expect(within(popover).getByText("RC1")).toBeInTheDocument();
    expect(within(popover).queryByText("See all")).not.toBeInTheDocument();
    // the event falls in the 2027 bucket, the third data point
    const eventPointX = getSeriesPointXs()[YEARS.indexOf("2027")];
    await waitFor(() => {
      expect(getMarkerLineXs()).toEqual([Math.round(eventPointX)]);
    });
    await waitFor(() => {
      expect(getHighlightedPointXs()).toEqual([eventPointX]);
    });

    await userEvent.unhover(chip);

    await waitFor(() => {
      expect(getMarkerLineXs()).toEqual([]);
    });
    await waitFor(() => {
      expect(getHighlightedPointXs()).toEqual([]);
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
  });

  it("shows events on an ad-hoc question", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createMockUnsavedCard({
        dataset_query: createCountByCreatedAtCard("year").dataset_query,
        display: "bar",
      }),
      dataset: YEARLY_DATASET,
    });

    expect(await findEventChip("RC1")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("view-footer")).getByLabelText("calendar icon"),
    ).toBeInTheDocument();
  });

  it("does not show events on a question that is not a time series", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createMockUnsavedCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                ],
                breakouts: [
                  {
                    type: "column",
                    name: "TOTAL",
                    binning: { strategy: "default" },
                  },
                ],
              },
            ],
          }),
        ),
        display: "bar",
      }),
      dataset: createMockDataset({
        data: createMockDatasetData({
          cols: [
            createOrdersTotalDatasetColumn({
              source: "breakout",
              binning_info: {
                binning_strategy: "num-bins",
                num_bins: 10,
                bin_width: 20,
                min_value: 0,
                max_value: 200,
              },
            }),
            COUNT_COLUMN,
          ],
          rows: [
            [20, 10],
            [40, 20],
            [60, 30],
          ],
        }),
      }),
    });

    expect(await screen.findByTestId("chart-container")).toBeInTheDocument();
    await act(async () => {
      await fetchMock.callHistory.flush(true);
    });
    expect(queryEventChip("RC1")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("timeline-events-band"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("view-footer")).queryByLabelText(
        "calendar icon",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows events on a native question", async () => {
    const releases = createTimeline({ name: "Releases" }, [
      { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
    ]);
    setupTimelineBackend([releases]);
    await setup({
      // a saved native question runs when it opens; an ad-hoc one waits for
      // the user to run it
      card: createMockCard({
        id: 8,
        name: "Native orders by month",
        dataset_query: Lib.toJsQuery(
          Lib.createTestNativeQuery(SAMPLE_PROVIDER, {
            query:
              "SELECT DATE_TRUNC('month', CREATED_AT) AS CREATED_AT, COUNT(*) AS TOTAL FROM ORDERS GROUP BY 1 ORDER BY 1",
          }),
        ),
        display: "line",
        visualization_settings: {
          "graph.dimensions": ["CREATED_AT"],
          "graph.metrics": ["TOTAL"],
          "timeline.selected_timeline_ids": [releases.id],
        },
      }),
      dataset: createMockDataset({
        data: createMockDatasetData({
          cols: [
            createMockColumn({
              name: "CREATED_AT",
              display_name: "CREATED_AT",
              base_type: "type/DateTime",
              effective_type: "type/DateTime",
              source: "native",
              field_ref: [
                "field",
                "CREATED_AT",
                { "base-type": "type/DateTime" },
              ],
            }),
            createMockColumn({
              name: "TOTAL",
              display_name: "TOTAL",
              base_type: "type/BigInteger",
              effective_type: "type/BigInteger",
              source: "native",
              field_ref: ["field", "TOTAL", { "base-type": "type/BigInteger" }],
            }),
          ],
          rows: getMonths("2025-01-01", 52).map((month, index) => [
            `${month}T00:00:00Z`,
            index + 1,
          ]),
        }),
      }),
    });
    expect(await findEventChip("RC1")).toBeInTheDocument();
  });

  it("shows the event popover on a chart split into panels (metabase#74005)", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "star" },
      ]),
    ]);
    const months = getMonths("2025-01-01", 52);
    await setup({
      card: createMockUnsavedCard({
        dataset_query: Lib.toJsQuery(
          Lib.createTestQuery(SAMPLE_PROVIDER, {
            stages: [
              {
                source: { type: "table", id: ORDERS_ID },
                aggregations: [
                  { type: "operator", operator: "count", args: [] },
                  {
                    type: "operator",
                    operator: "sum",
                    args: [{ type: "column", name: "TOTAL" }],
                  },
                ],
                breakouts: [
                  { type: "column", name: "CREATED_AT", unit: "month" },
                ],
              },
            ],
          }),
        ),
        display: "line",
        visualization_settings: { "graph.split_panels": true },
      }),
      dataset: createMockDataset({
        data: createMockDatasetData({
          cols: [
            createOrdersCreatedAtDatasetColumn({
              source: "breakout",
              unit: "month",
              field_ref: [
                "field",
                ORDERS.CREATED_AT,
                { "temporal-unit": "month" },
              ],
            }),
            COUNT_COLUMN,
            createMockNumericColumn({
              name: "sum",
              display_name: "Sum of Total",
              source: "aggregation",
              field_ref: ["aggregation", 1],
            }),
          ],
          rows: months.map((month, index) => [
            `${month}T00:00:00Z`,
            index + 1,
            (index + 1) * 100,
          ]),
        }),
      }),
    });

    await userEvent.hover(await findEventChip("RC1"));

    const popover = await screen.findByTestId("timeline-event-popover");
    expect(within(popover).getByText("RC1")).toBeInTheDocument();
  });

  it("stacks close events and spreads the stack while it is hovered", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        {
          name: "Jan release",
          timestamp: "2027-01-30T00:00:00Z",
          icon: "star",
        },
        { name: "Feb fix", timestamp: "2027-02-02T00:00:00Z", icon: "warning" },
        {
          name: "Summer party",
          timestamp: "2028-07-04T00:00:00Z",
          icon: "cake",
        },
      ]),
    ]);
    await setup({
      card: createMockUnsavedCard({
        dataset_query: createCountByCreatedAtCard("month").dataset_query,
        display: "line",
      }),
      dataset: MONTHLY_DATASET,
    });

    const stack = await screen.findByTestId("timeline-event-stack");
    expect(stack).toHaveAttribute("data-expanded", "false");
    expect(within(stack).getByLabelText("Jan release")).toBeInTheDocument();
    expect(within(stack).getByLabelText("Feb fix")).toBeInTheDocument();
    expect(
      within(stack).queryByLabelText("Summer party"),
    ).not.toBeInTheDocument();
    expect(await findEventChip("Summer party")).toHaveAttribute(
      "aria-hidden",
      "false",
    );

    await userEvent.hover(within(stack).getByLabelText("Feb fix"));

    expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(queryEventChip("Summer party")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await waitFor(() => {
      expect(getMarkerLineXs()).toHaveLength(1);
    });

    await userEvent.hover(
      within(screen.getByTestId("timeline-event-stack")).getByLabelText(
        "Jan release",
      ),
    );
    // the popover of "Feb fix" can still be closing
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId("timeline-event-popover")
          .filter((popover) => within(popover).queryByText("Jan release")),
      ).toHaveLength(1);
    });
    expect(getMarkerLineXs()).toHaveLength(1);

    await userEvent.unhover(
      within(screen.getByTestId("timeline-event-stack")).getByLabelText(
        "Jan release",
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId("timeline-event-stack")).toHaveAttribute(
        "data-expanded",
        "false",
      );
    });
    expect(queryEventChip("Summer party")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
  });

  it("collapses events of one data point into a count chip and focuses the events panel on them", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "Alpha", timestamp: "2027-10-03T00:00:00Z" },
        { name: "Beta", timestamp: "2027-10-10T00:00:00Z" },
        { name: "Gamma", timestamp: "2027-10-17T00:00:00Z" },
        { name: "Delta", timestamp: "2027-10-24T00:00:00Z" },
      ]),
      createTimeline({ name: "Other" }, [
        { name: "Outsider", timestamp: "2028-01-15T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createMockUnsavedCard({
        dataset_query: createCountByCreatedAtCard("month").dataset_query,
        display: "line",
      }),
      dataset: MONTHLY_DATASET,
    });

    const chip = await findEventChip("4 events");
    expect(chip).toHaveTextContent("4");

    await userEvent.hover(chip);
    const popover = await screen.findByTestId("timeline-event-popover");
    expect(within(popover).getByText("Alpha")).toBeInTheDocument();
    expect(within(popover).getByText("Beta")).toBeInTheDocument();
    expect(within(popover).getByText("Gamma")).toBeInTheDocument();
    expect(within(popover).queryByText("Delta")).not.toBeInTheDocument();
    await userEvent.click(within(popover).getByText("See all"));

    await waitFor(() => {
      expect(
        screen.queryByTestId("timeline-event-popover"),
      ).not.toBeInTheDocument();
    });
    expect(queryEventChip("4 events")).toHaveAttribute("data-selected", "true");
    expect(await within(getSidebar()).findByText("Alpha")).toBeInTheDocument();
    expect(within(getSidebar()).getByText("Delta")).toBeInTheDocument();
    expect(within(getSidebar()).queryByText("Other")).not.toBeInTheDocument();
    expect(
      within(getSidebar()).queryByText("Outsider"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("timeline-sidebar-show-all"));
    expect(await within(getSidebar()).findByText("Other")).toBeInTheDocument();

    await userEvent.click(checkNotNull(queryEventChip("4 events")));
    expect(queryEventChip("4 events")).toHaveAttribute(
      "data-selected",
      "false",
    );
    expect(within(getSidebar()).getByText("Other")).toBeInTheDocument();

    await userEvent.click(checkNotNull(queryEventChip("4 events")));
    expect(
      await screen.findByTestId("timeline-sidebar-show-all"),
    ).toBeInTheDocument();
    expect(within(getSidebar()).getByText("Alpha")).toBeInTheDocument();
    expect(within(getSidebar()).queryByText("Other")).not.toBeInTheDocument();
  });

  it("selects a single event and opens the full events panel when its chip is clicked", async () => {
    const releases = createTimeline({ name: "Releases" }, [
      { name: "RC0", timestamp: "2026-01-01T00:00:00Z" },
      { name: "RC1", timestamp: "2027-01-01T00:00:00Z" },
    ]);
    setupTimelineBackend([releases]);
    await setup({
      card: createCountByCreatedAtCard("year", {
        visualization_settings: {
          "timeline.selected_timeline_ids": [releases.id],
        },
      }),
      dataset: YEARLY_DATASET,
    });

    await userEvent.click(await findEventChip("RC1"));

    expect(queryEventChip("RC1")).toHaveAttribute("data-selected", "true");
    expect(queryEventChip("RC0")).toHaveAttribute("data-selected", "false");
    expect(await within(getSidebar()).findByText("RC1")).toBeInTheDocument();
    expect(
      screen.queryByTestId("timeline-sidebar-show-all"),
    ).not.toBeInTheDocument();
    expect(within(getSidebar()).getByText("RC0")).toBeInTheDocument();
  });

  it("hides and shows single events and whole timelines, including new ones", async () => {
    const releases = createTimeline({ id: 61, name: "Releases" }, [
      { id: 62, name: "RC1", timestamp: "2027-10-20T00:00:00Z", icon: "cloud" },
    ]);
    const parent = createMockCollection({ id: 10, name: "Parent" });
    const collectionTimeline = createTimeline(
      {
        id: 63,
        name: "Timeline for collection",
        collection_id: parent.id,
        collection: parent,
      },
      [
        {
          id: 64,
          name: "TC1",
          timestamp: "2025-05-20T00:00:00Z",
          icon: "warning",
        },
      ],
    );
    setupTimelineBackend([releases, collectionTimeline]);
    await setup({
      card: createCountByCreatedAtCard("year", {
        visualization_settings: {
          "timeline.selected_timeline_ids": [releases.id],
        },
      }),
      dataset: YEARLY_DATASET,
      withUndos: true,
    });
    expect(await findEventChip("RC1")).toBeInTheDocument();
    expect(queryEventChip("TC1")).not.toBeInTheDocument();

    // hides a single event on the chart when it is hidden in the panel
    const sidebar = await openEventsPanel();
    await userEvent.click(await within(sidebar).findByText("Releases"));
    await userEvent.click(getTimelineEventCheckbox("RC1"));
    await waitFor(() => {
      expect(queryEventChip("RC1")).not.toBeInTheDocument();
    });

    // shows it again
    await userEvent.click(getTimelineEventCheckbox("RC1"));
    expect(await findEventChip("RC1")).toBeInTheDocument();

    // shows a newly created event
    await createEventFromPanel("RC2", "10/20/2026");
    expect(await findEventChip("RC2")).toBeInTheDocument();
    expect(getRequestBodies("POST", "/api/timeline-event")).toEqual([
      expect.objectContaining({ name: "RC2", timeline_id: releases.id }),
    ]);

    // then hides the newly created event
    expect(getTimelineEventCheckbox("RC2")).toBeChecked();
    await userEvent.click(getTimelineEventCheckbox("RC2"));
    expect(getTimelineEventCheckbox("RC2")).not.toBeChecked();
    await waitFor(() => {
      expect(queryEventChip("RC2")).not.toBeInTheDocument();
    });
    expect(queryEventChip("RC1")).toBeInTheDocument();

    // a shown timeline with one hidden event is partly checked
    expect(getTimelineCheckbox("Releases")).toBePartiallyChecked();

    // hiding the timeline and showing it again shows all its events
    await userEvent.click(getTimelineCheckbox("Releases"));
    await waitFor(() => {
      expect(queryEventChip("RC1")).not.toBeInTheDocument();
    });
    await userEvent.click(getTimelineCheckbox("Releases"));
    expect(await findEventChip("RC2")).toBeInTheDocument();
    expect(await findEventChip("RC1")).toBeInTheDocument();

    // the events of a timeline hidden on page load start unchecked
    await userEvent.click(
      within(getSidebar()).getByText("Timeline for collection"),
    );
    expect(getTimelineEventCheckbox("TC1")).not.toBeChecked();

    // showing that timeline shows its events
    await userEvent.click(getTimelineCheckbox("Timeline for collection"));
    expect(await findEventChip("TC1")).toBeInTheDocument();

    // and they can then be hidden one by one
    await userEvent.click(getTimelineEventCheckbox("TC1"));
    await waitFor(() => {
      expect(queryEventChip("TC1")).not.toBeInTheDocument();
    });

    // a single event shown in the last bucket of the chart (metabase#56290)
    await createEventFromPanel("Event at the end of range", "10/20/2029");
    await userEvent.click(getTimelineEventCheckbox("RC1"));
    expect(getTimelineEventCheckbox("RC1")).not.toBeChecked();
    await userEvent.click(getTimelineEventCheckbox("RC2"));
    expect(getTimelineEventCheckbox("RC2")).not.toBeChecked();
    await waitFor(() => {
      expect(queryEventChip("RC2")).not.toBeInTheDocument();
    });
    expect(
      await findEventChip("Event at the end of range"),
    ).toBeInTheDocument();
  });

  it("does not filter out events in the last bucket of each time grouping (metabase#23336)", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        // all are after the last order (2029-04-19), in the last bucket of
        // their grouping only
        { name: "Last week", timestamp: "2029-04-20T12:00:00Z" },
        { name: "Last month", timestamp: "2029-04-27T12:00:00Z" },
        { name: "Last quarter", timestamp: "2029-05-10T12:00:00Z" },
        { name: "Last year", timestamp: "2029-09-10T12:00:00Z" },
      ]),
    ]);
    const BUCKET_UNITS = ["week", "month", "quarter", "year"] as const;
    const lastBucketByUnit: Record<(typeof BUCKET_UNITS)[number], string> = {
      week: "2029-04-15",
      month: "2029-04-01",
      quarter: "2029-04-01",
      year: "2029-01-01",
    };
    fetchMock.post("path:/api/dataset", (call) => {
      const body = String(call.options.body);
      const unit = BUCKET_UNITS.find((unit) =>
        body.includes(`"temporal-unit":"${unit}"`),
      );
      const lastBucket = unit && lastBucketByUnit[unit];
      if (unit == null || lastBucket == null) {
        return { status: 400 };
      }
      return createCountByCreatedAtDataset(
        unit,
        Array.from({ length: 6 }, (_, index) =>
          unit === "quarter"
            ? dayjs
                .utc(lastBucket)
                .subtract((5 - index) * 3, "month")
                .format("YYYY-MM-DD")
            : dayjs
                .utc(lastBucket)
                .subtract(5 - index, unit)
                .format("YYYY-MM-DD"),
        ),
      );
    });
    await setup({
      card: createMockUnsavedCard({
        dataset_query: createCountByCreatedAtCard("week").dataset_query,
        display: "line",
      }),
      // like the sample database, so that a new grouping runs the query
      database: createSampleDatabase({ auto_run_queries: true }),
    });

    const expectEventsInPanel = async (unit: TemporalUnit, names: string[]) => {
      await waitFor(() => {
        const requestedUnits = fetchMock.callHistory
          .calls("path:/api/dataset", { method: "POST" })
          .map(
            (call) =>
              String(call.options.body).match(/"temporal-unit":"(\w+)"/)?.[1],
          );
        expect(requestedUnits.at(-1)).toBe(unit);
      });
      await waitFor(() => {
        expect(
          ["Last week", "Last month", "Last quarter", "Last year"].filter(
            (name) => within(getSidebar()).queryByText(name) != null,
          ),
        ).toEqual(names);
      });
    };
    const changeUnit = async (from: string, to: string) => {
      await userEvent.click(
        within(screen.getByTestId("timeseries-chrome")).getByText(from),
      );
      await userEvent.click(await screen.findByText(to));
    };

    await openEventsPanel();
    await expectEventsInPanel("week", ["Last week"]);

    await changeUnit("Week", "Month");
    await expectEventsInPanel("month", ["Last week", "Last month"]);

    await changeUnit("Month", "Quarter");
    await expectEventsInPanel("quarter", [
      "Last week",
      "Last month",
      "Last quarter",
    ]);

    await changeUnit("Quarter", "Year");
    await expectEventsInPanel("year", [
      "Last week",
      "Last month",
      "Last quarter",
      "Last year",
    ]);
  });

  it("saves a display change when the question selects a timeline that was deleted", async () => {
    const DELETED_TIMELINE_ID = 99;
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("month", {
        name: "Orders by month",
        display: "table",
        visualization_settings: {
          "timeline.selected_timeline_ids": [DELETED_TIMELINE_ID],
        },
      }),
      dataset: MONTHLY_DATASET,
    });

    await userEvent.click(screen.getByTestId("viz-type-button"));
    await userEvent.click(
      within(await screen.findByTestId("chart-type-sidebar")).getByTestId(
        "Line-button",
      ),
    );
    await waitFor(() => {
      expect(
        within(getChart()).getByText("Created At: Month"),
      ).toBeInTheDocument();
    });
    await saveQuestion();

    expect(getRequestBodies("PUT", `/api/card/7`)).toEqual([
      expect.objectContaining({
        display: "line",
        visualization_settings: expect.objectContaining({
          "timeline.selected_timeline_ids": [DELETED_TIMELINE_ID],
        }),
      }),
    ]);
    await waitFor(() => {
      expect(
        within(screen.getByTestId("qb-header")).queryByRole("button", {
          name: "Save",
        }),
      ).not.toBeInTheDocument();
    });
  });

  it.each([
    { canWrite: true, description: /^Add events to Metabase/ },
    { canWrite: false, description: /^Events in Metabase/ },
  ])(
    "offers to create the first event only to users who can write to the collection (can write: $canWrite)",
    async ({ canWrite, description }) => {
      setupTimelineBackend([]);
      fetchMock.get(
        "path:/api/collection/root",
        canWrite ? ROOT : READ_ONLY_ROOT,
      );
      await setup({
        card: createCountByCreatedAtCard("year"),
        dataset: YEARLY_DATASET,
      });

      const sidebar = await openEventsPanel();

      expect(await within(sidebar).findByText(description)).toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", { name: "Create event" }) != null,
      ).toBe(canWrite);
    },
  );

  it.each([{ canWrite: true }, { canWrite: false }])(
    "lets only users who can write to the collection create and edit events (can write: $canWrite)",
    async ({ canWrite }) => {
      const collection = canWrite ? ROOT : READ_ONLY_ROOT;
      setupTimelineBackend([
        createTimeline({ name: "Releases", collection }, [
          { name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
        ]),
      ]);
      fetchMock.get("path:/api/collection/root", collection);
      await setup({
        card: createCountByCreatedAtCard("year"),
        dataset: YEARLY_DATASET,
      });

      const sidebar = await openEventsPanel();

      expect(await within(sidebar).findByText("Releases")).toBeInTheDocument();
      expect(within(sidebar).getByText("RC1")).toBeInTheDocument();
      expect(
        within(sidebar).queryByRole("button", { name: "Create event" }) != null,
      ).toBe(canWrite);
      expect(within(sidebar).queryByLabelText("Event menu") != null).toBe(
        canWrite,
      );
    },
  );

  it("tracks opening the events panel from the footer and saving a recorded selection", async () => {
    const releases = createTimeline({ name: "Releases" }, [
      { id: 71, name: "RC0", timestamp: "2026-10-20T00:00:00Z" },
      { id: 72, name: "RC1", timestamp: "2027-10-20T00:00:00Z" },
    ]);
    setupTimelineBackend([releases]);
    const card = createCountByCreatedAtCard("year", {
      visualization_settings: {
        "timeline.selected_timeline_ids": [releases.id],
      },
    });
    setupCardUpdateEndpoint(card);
    await setup({ card, dataset: YEARLY_DATASET });
    expect(await findEventChip("RC1")).toBeInTheDocument();

    await openEventsPanel();
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "question_events_panel_opened",
      triggered_from: "footer",
    });

    await userEvent.click(getTimelineEventCheckbox("RC1"));
    await waitFor(() => {
      expect(queryEventChip("RC1")).not.toBeInTheDocument();
    });
    expect(queryEventChip("RC0")).toBeInTheDocument();
    expect(trackSimpleEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: "question_timeline_events_saved" }),
    );
    await saveQuestion();

    expect(getRequestBodies("PUT", "/api/card/7")).toEqual([
      expect.objectContaining({
        visualization_settings: expect.objectContaining({
          "timeline.selected_timeline_ids": [releases.id],
          "timeline.excluded_timeline_event_ids": [72],
        }),
      }),
    ]);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "question_timeline_events_saved",
      target_id: 7,
    });
  });

  it("records no selection when a new question is saved while the timelines fail to load", async () => {
    fetchMock.get("path:/api/timeline", {
      status: 500,
      body: { message: "Timelines are unavailable" },
    });
    setupCardCreateEndpoint();
    fetchMock.get(
      /\/api\/card\/\d+\/query_metadata/,
      createMockCardQueryMetadata(),
    );
    await setup({
      card: createMockUnsavedCard({
        dataset_query: createCountByCreatedAtCard("month").dataset_query,
        display: "line",
      }),
      dataset: MONTHLY_DATASET,
    });

    await saveQuestion();

    await waitFor(() => {
      expect(getRequestBodies("POST", "/api/card")).toHaveLength(1);
    });
    const [{ visualization_settings }] = getRequestBodies("POST", "/api/card");
    expect(visualization_settings).not.toHaveProperty([
      "timeline.selected_timeline_ids",
    ]);
    expect(visualization_settings).not.toHaveProperty([
      "timeline.excluded_timeline_event_ids",
    ]);
    expect(
      fetchMock.callHistory.called("path:/api/timeline", { method: "GET" }),
    ).toBe(true);
  });

  it("keeps a timeline added later off a question saved with no timelines, until the user turns it on", async () => {
    const migration = createTimeline({ name: "Migration seasons" }, [
      { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
      { name: "Swifts return", timestamp: "2028-08-20T00:00:00Z" },
    ]);
    setupTimelineBackend([migration]);
    const card = createCountByCreatedAtCard("year", {
      visualization_settings: { "timeline.selected_timeline_ids": [] },
    });
    setupCardUpdateEndpoint(card);
    await setup({ card, dataset: YEARLY_DATASET });

    const sidebar = await openEventsPanel();
    await within(sidebar).findByText("Migration seasons");
    expect(getTimelineCheckbox("Migration seasons")).not.toBeChecked();
    expect(queryEventChip("Swallows return")).not.toBeInTheDocument();
    expect(queryEventChip("Swifts return")).not.toBeInTheDocument();

    await userEvent.click(getTimelineCheckbox("Migration seasons"));

    expect(await findEventChip("Swallows return")).toBeInTheDocument();
    expect(await findEventChip("Swifts return")).toBeInTheDocument();
    await saveQuestion();
    expect(getRequestBodies("PUT", "/api/card/7")).toEqual([
      expect.objectContaining({
        visualization_settings: expect.objectContaining({
          "timeline.selected_timeline_ids": [migration.id],
          "timeline.excluded_timeline_event_ids": [],
        }),
      }),
    ]);
  });

  it("discards unsaved event choices when the saved question is opened again", async () => {
    const migration = createTimeline({ name: "Migration seasons" }, [
      { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
      { name: "Swifts return", timestamp: "2028-08-20T00:00:00Z" },
    ]);
    setupTimelineBackend([migration]);
    const card = createCountByCreatedAtCard("year", {
      visualization_settings: {
        "timeline.selected_timeline_ids": [migration.id],
      },
    });
    setupCardUpdateEndpoint(card);
    const { router } = await setup({ card, dataset: YEARLY_DATASET });
    expect(await findEventChip("Swallows return")).toBeInTheDocument();

    await openEventsPanel();
    await userEvent.click(getTimelineCheckbox("Migration seasons"));
    await waitFor(() => {
      expect(queryEventChip("Swallows return")).not.toBeInTheDocument();
    });
    expect(queryEventChip("Swifts return")).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("qb-header")).getByRole("button", {
        name: "Save",
      }),
    ).toBeInTheDocument();

    // reopen the question in the same app, without saving
    act(() => {
      router.navigate("/redirect");
    });
    expect(screen.queryByTestId("query-builder-root")).not.toBeInTheDocument();
    act(() => {
      router.navigate(`/question/${card.id}`);
    });

    expect(await findEventChip("Swallows return")).toBeInTheDocument();
    expect(await findEventChip("Swifts return")).toBeInTheDocument();
    expect(getRequestBodies("PUT", "/api/card/7")).toEqual([]);
  });

  it("does not record the collection's timelines when saving an unrelated chart change", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Migration seasons" }, [
        { name: "Swallows return", timestamp: "2027-04-20T00:00:00Z" },
        { name: "Swifts return", timestamp: "2028-08-20T00:00:00Z" },
      ]),
    ]);
    const card = createCountByCreatedAtCard("year");
    setupCardUpdateEndpoint(card);
    await setup({ card, dataset: YEARLY_DATASET });

    const sidebar = await openEventsPanel();
    await within(sidebar).findByText("Migration seasons");
    expect(getTimelineCheckbox("Migration seasons")).not.toBeChecked();
    expect(queryEventChip("Swallows return")).not.toBeInTheDocument();
    expect(queryEventChip("Swifts return")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("viz-settings-button"));
    const settingsSidebar = await screen.findByTestId("chartsettings-sidebar");
    await userEvent.click(within(settingsSidebar).getByText("Display"));
    await userEvent.click(
      within(settingsSidebar).getByText("Show values on data points"),
    );
    await saveQuestion();

    const [{ visualization_settings }] = getRequestBodies("PUT", "/api/card/7");
    expect(visualization_settings).toMatchObject({ "graph.show_values": true });
    expect(visualization_settings).not.toHaveProperty([
      "timeline.selected_timeline_ids",
    ]);
    expect(visualization_settings).not.toHaveProperty([
      "timeline.excluded_timeline_event_ids",
    ]);
    expect(queryEventChip("Swallows return")).not.toBeInTheDocument();
  });

  it("renders markdown in an event description", async () => {
    setupTimelineBackend([
      createTimeline({ name: "Releases" }, [
        {
          name: "RC1",
          description: "[Release notes](https://metabase.test)",
          timestamp: "2027-10-20T00:00:00Z",
        },
      ]),
    ]);
    await setup({
      card: createCountByCreatedAtCard("year"),
      dataset: YEARLY_DATASET,
    });

    const sidebar = await openEventsPanel();

    expect(await within(sidebar).findByText("Releases")).toBeInTheDocument();
    expect(
      within(sidebar).getByRole("link", { name: "Release notes" }),
    ).toHaveAttribute("href", "https://metabase.test");
    expect(
      within(sidebar).queryByText("[Release notes](https://metabase.test)"),
    ).not.toBeInTheDocument();
  });
});
