import dayjs from "dayjs";
import { assoc } from "icepick";

import "metabase/utils/dayjs";

import { createMockEntitiesState } from "__support__/store";
import {
  getFilteredTimelines,
  getIsResultDirty,
  getIsVisualized,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestion,
  getQuestionDetailsTimelineDrawerState,
  getResultsMetadata,
  getShouldShowUnsavedChangesWarning,
  getSubmittableQuestion,
} from "metabase/query_builder/selectors";
import type {
  QueryBuilderState,
  QueryBuilderUIControls,
  Range,
} from "metabase/redux/store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { TimeSeriesInterval } from "metabase/visualizations/echarts/cartesian/model/types";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  ConcreteFieldReference,
  Database,
  NativeQuery,
  StructuredQuery,
} from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNativeQuery,
  createMockTable,
  createMockTableColumnOrderSetting,
  createMockTemplateTag,
  createMockTimeline,
  createMockTimelineEvent,
  createMockVisualizationSettings,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

function getBaseState({
  uiControls = {},
  database = createSampleDatabase(),
  ...state
}: Partial<Omit<QueryBuilderState, "uiControls">> & {
  uiControls?: Partial<QueryBuilderUIControls>;
  database?: Database;
} = {}) {
  return createMockState({
    entities: createMockEntitiesState({
      databases: [database],
      tables: [createMockTable({ id: "card__1" })],
    }),
    qb: createMockQueryBuilderState({
      ...state,
      uiControls: createMockQueryBuilderUIControlsState({
        queryBuilderMode: "view",
        ...uiControls,
      }),
    }),
  });
}

describe("getQuestion", () => {
  it("should be nothing if card data is missing", () => {
    const state = getBaseState({ card: null });
    expect(getQuestion(state)).toBe(undefined);
  });

  it("should return question instance correctly", () => {
    const card = createMockCard({
      id: 5,
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": 1,
        },
      },
    });

    const question = getQuestion(getBaseState({ card }));

    expect(question).toBeInstanceOf(Question);
    expect(question?._doNotCallSerializableCard()).toEqual(card);
  });

  it("should return composed dataset when dataset is open", () => {
    const card = createMockCard({
      id: 1,
      type: "model",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
      },
    });

    const question = getQuestion(getBaseState({ card }));

    expect(question && Lib.sourceTableOrCardId(question.query())).toBe(
      "card__1",
    );
  });

  it("should return real dataset when dataset is open in 'dataset' QB mode", () => {
    const card = createMockCard({
      id: 5,
      type: "model",
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": 1,
        },
      },
    });

    const question = getQuestion(
      getBaseState({
        card,
        uiControls: {
          queryBuilderMode: "dataset",
        },
      }),
    );

    expect(question?.card()).toEqual(assoc(card, "displayIsLocked", true));
  });

  it("should return an editable ad-hoc query for a read-only native model (metabase#56698)", () => {
    const card = createMockCard({
      id: 1,
      type: "model",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: { query: "select 1 union all select 2" },
      },
    });

    // A user without native permissions cannot edit the model's native query,
    // but must still get an editable ad-hoc query composed on top of the model.
    const question = getQuestion(
      getBaseState({
        card,
        database: createSampleDatabase({ native_permissions: "none" }),
      }),
    );

    expect(question).toBeInstanceOf(Question);
    expect(question && Lib.sourceTableOrCardId(question.query())).toBe(
      "card__1",
    );
    expect(question && Lib.queryDisplayInfo(question.query()).isEditable).toBe(
      true,
    );
    expect(question && Lib.queryDisplayInfo(question.query()).isNative).toBe(
      false,
    );
  });
});

describe("getIsResultDirty", () => {
  describe("structured query", () => {
    function getCard(query: StructuredQuery) {
      return createMockCard({
        dataset_query: { type: "query", database: 1, query },
      });
    }

    function getState(
      lastRunCardQuery: StructuredQuery,
      cardQuery: StructuredQuery,
    ) {
      return getBaseState({
        card: getCard(cardQuery),
        lastRunCard: getCard(lastRunCardQuery),
      });
    }

    it("should not be dirty for empty queries", () => {
      const state = getState({}, {});
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if the table was changed", () => {
      const state = getState({ "source-table": 1 }, { "source-table": 2 });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should be dirty if the fields were changed", () => {
      const state = getState(
        { "source-table": 1, fields: [["field", 1, null]] },
        { "source-table": 1, fields: [["field", 2, null]] },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("converts clauses into plain MBQL objects", () => {
      const query: StructuredQuery = {
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, null]],
        filter: [">", ["field", ORDERS.TOTAL, null], 20],
        joins: [
          {
            alias: "Products",
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, null],
            ],
          },
        ],
      };

      const state = getState(query, query);

      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if the fields were reordered", () => {
      const state = getState(
        {
          "source-table": 1,
          fields: [
            ["field", 1, null],
            ["field", 2, null],
          ],
        },
        {
          "source-table": 1,
          fields: [
            ["field", 2, null],
            ["field", 1, null],
          ],
        },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields with fk refs were reordered", () => {
      const state = getState(
        {
          "source-table": 1,
          fields: [
            ["field", 2, { "source-field": 1 }],
            ["field", 1, null],
          ],
        },
        {
          "source-table": 1,
          fields: [
            ["field", 1, null],
            ["field", 2, { "source-field": 1 }],
          ],
        },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should not be dirty if fields were just made explicit", () => {
      const orderTableFieldIds = Object.values(ORDERS);
      const orderTableFieldRefs = orderTableFieldIds.map(
        (id): ConcreteFieldReference => ["field", id, null],
      );

      const state = getState(
        { "source-table": ORDERS_ID },
        {
          "source-table": ORDERS_ID,
          fields: orderTableFieldRefs,
        },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });
  });

  describe("native query", () => {
    function getCard(native: NativeQuery) {
      return createMockCard({
        dataset_query: {
          database: 1,
          type: "native",
          native,
        },
      });
    }

    function getState(lastRunCardQuery: NativeQuery, cardQuery: NativeQuery) {
      return getBaseState({
        card: getCard(cardQuery),
        lastRunCard: getCard(lastRunCardQuery),
      });
    }

    it("should not be dirty if template-tags is empty vs an empty object", () => {
      const state = getState(
        {
          query: "SELECT 1",
        },
        { query: "SELECT 1", "template-tags": {} },
      );
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if template-tags differ", () => {
      const state = getState(
        createMockNativeQuery({
          query: "SELECT {{foo}}",
          "template-tags": { foo: createMockTemplateTag({ name: "foo" }) },
        }),
        createMockNativeQuery({
          query: "SELECT {{bar}}",
          "template-tags": { bar: createMockTemplateTag({ name: "bar" }) },
        }),
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    describe("native editor selection/cursor", () => {
      function getStateWithSelectedQueryText(ranges: Range[]) {
        return getBaseState({
          card: createMockCard({
            dataset_query: {
              type: "native",
              database: 1,
              native: { query: "1\n22\n333" },
            },
          }),
          uiControls: {
            nativeEditorSelectedRange: ranges,
          },
        });
      }

      [
        [{ row: 0, column: 0 }, 0] as const,
        [{ row: 1, column: 1 }, 3] as const,
        [{ row: 2, column: 3 }, 8] as const,
      ].forEach(([position, offset]) =>
        it(`should correctly determine the cursor offset for ${JSON.stringify(
          position,
        )}`, () => {
          const state = getStateWithSelectedQueryText([
            { start: position, end: position },
          ]);
          expect(getNativeEditorCursorOffset(state)).toBe(offset);
        }),
      );

      [
        [{ row: 0, column: 0 }, { row: 0, column: 0 }, ""] as const,
        [{ row: 0, column: 0 }, { row: 2, column: 3 }, "1\n22\n333"] as const,
        [{ row: 1, column: 0 }, { row: 1, column: 2 }, "22"] as const,
      ].forEach(([start, end, text]) =>
        it(`should correctly get selected text from ${JSON.stringify(
          start,
        )} to ${JSON.stringify(end)}`, () => {
          const state = getStateWithSelectedQueryText([{ start, end }]);
          expect(getNativeEditorSelectedText(state)).toBe(text);
        }),
      );

      it("should correctly get selected text when there are multiple selected ranges", () => {
        const state = getStateWithSelectedQueryText([
          { start: { row: 2, column: 0 }, end: { row: 2, column: 2 } },
          { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
        ]);
        expect(getNativeEditorSelectedText(state)).toBe("33");
      });
    });
  });

  describe("models", () => {
    function getDataset(query: StructuredQuery) {
      return createMockCard({
        id: 1,
        type: "model",
        dataset_query: { type: "query", database: 1, query },
      });
    }

    const dataset = getDataset({ "source-table": 1 });

    it("should not be dirty if model is not changed", () => {
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if model is changed", () => {
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: getDataset({ "source-table": 2 }),
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty if model simple mode is active", () => {
      const adHocDatasetCard = getDataset({ "source-table": "card__1" });
      const state = getBaseState({
        card: adHocDatasetCard,
        originalCard: dataset,
        lastRunCard: adHocDatasetCard,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty when building a new question on a model", () => {
      const card = createMockCard({
        dataset_query: {
          database: 1,
          type: "query",
          query: {
            aggregation: [["count"]],
            "source-table": "card__1",
          },
        },
      });
      const state = getBaseState({
        card,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty when the last run question is the composed model and the current question is equivalent to the original", () => {
      const adHocDatasetCard = getDataset({ "source-table": "card__1" });
      const state = getBaseState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: adHocDatasetCard,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });
  });
});

describe("getSubmittableQuestion", () => {
  // metabase#30610: when the query has been edited but not re-run, the last
  // query result's results_metadata is stale and must not be saved onto the
  // card. getSubmittableQuestion drops it (sends null) whenever the result is
  // dirty, and keeps it when the result matches the current query.
  const RESULTS_METADATA_COLUMNS = [
    createMockColumn({ name: "ID", display_name: "ID" }),
    createMockColumn({ name: "TOTAL", display_name: "Total" }),
  ];

  function getState({
    cardQuery,
    lastRunQuery,
  }: {
    cardQuery: StructuredQuery;
    lastRunQuery: StructuredQuery;
  }) {
    const makeCard = (query: StructuredQuery) =>
      createMockCard({
        dataset_query: { type: "query", database: SAMPLE_DB_ID, query },
      });

    return getBaseState({
      card: makeCard(cardQuery),
      lastRunCard: makeCard(lastRunQuery),
      queryResults: [
        createMockDataset({
          data: createMockDatasetData({ cols: RESULTS_METADATA_COLUMNS }),
        }),
      ],
    });
  }

  it("drops stale results_metadata when the result is dirty (metabase#30610)", () => {
    const state = getState({
      cardQuery: { "source-table": PRODUCTS_ID },
      lastRunQuery: { "source-table": ORDERS_ID },
    });
    // the seeded state always resolves to a question
    const question = getQuestion(state) as Question;

    expect(getIsResultDirty(state)).toBe(true);
    expect(getSubmittableQuestion(state, question).card().result_metadata).toBe(
      null,
    );
  });

  it("keeps results_metadata when the result is not dirty", () => {
    const state = getState({
      cardQuery: { "source-table": ORDERS_ID },
      lastRunQuery: { "source-table": ORDERS_ID },
    });
    // the seeded state always resolves to a question
    const question = getQuestion(state) as Question;

    expect(getIsResultDirty(state)).toBe(false);
    expect(
      getSubmittableQuestion(state, question).card().result_metadata,
    ).toEqual(getResultsMetadata(state)?.columns);
  });
});

describe("getQuestionDetailsTimelineDrawerState", () => {
  it("should return a string representing the state of the question history timeline drawer", () => {
    const state = getBaseState({
      uiControls: {
        questionDetailsTimelineDrawerState: "foo",
      },
    });
    expect(getQuestionDetailsTimelineDrawerState(state)).toBe("foo");
  });
});

describe("getIsVisualized", () => {
  it("should be false when there is a `table.columns` setting only", () => {
    const state = getBaseState({
      card: createMockCard({
        display: "table",
        visualization_settings: createMockVisualizationSettings({
          "table.columns": [createMockTableColumnOrderSetting()],
        }),
      }),
    });
    expect(getIsVisualized(state)).toBe(false);
  });

  it("should be true when the table is implicitly visualized as a pivot table", () => {
    const state = getBaseState({
      card: createMockCard({
        display: "table",
      }),
      queryResults: [
        createMockDataset({
          data: createMockDatasetData({
            cols: [
              createMockColumn({
                name: "count",
                base_type: "type/Integer",
                effective_type: "type/Integer",
                source: "aggregation",
              }),
              createMockColumn({
                name: "CATEGORY",
                base_type: "type/Text",
                effective_type: "type/Text",
                source: "breakout",
              }),
              createMockColumn({
                name: "VENDOR",
                base_type: "type/Text",
                effective_type: "type/Text",
                source: "breakout",
              }),
            ],
          }),
        }),
      ],
    });
    expect(getIsVisualized(state)).toBe(true);
  });

  // metabase#56094: after switching an auto-pivot table to the raw "data" view,
  // display is "table" and `table.pivot` is not set, but `table.pivot_column`
  // remains. The question must still count as visualized so the display toggle
  // stays available to switch back to the pivot visualization.
  it("should be true when display is table and only `table.pivot_column` is set (metabase#56094)", () => {
    // getIsVisualized.resultFunc reads only display(), so a stub suffices
    const question = { display: () => "table" } as unknown as Question;
    const settings = { "table.pivot_column": "CATEGORY" };

    expect(getIsVisualized.resultFunc(question, settings)).toBeTruthy();
  });
});

describe("getShouldShowUnsavedChangesWarning", () => {
  describe("when creating or editing a model", () => {
    function getModelCard(query: StructuredQuery) {
      return createMockCard({
        id: 1,
        type: "model",
        dataset_query: { type: "query", database: SAMPLE_DB_ID, query },
      });
    }
    const model = getModelCard({ "source-table": ORDERS_ID });

    it("warns when creating a new model", () => {
      const state = getBaseState({
        card: model,
        originalCard: undefined,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("warns when an existing model has unsaved changes", () => {
      const state = getBaseState({
        card: getModelCard({ "source-table": PRODUCTS_ID }),
        originalCard: model,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when the model is unchanged", () => {
      const state = getBaseState({
        card: model,
        originalCard: model,
        uiControls: { queryBuilderMode: "dataset" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });

  describe("when editing a structured question", () => {
    const card = createMockCard({
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
      },
    });

    it("warns when modified from the notebook editor", () => {
      const state = getBaseState({
        card,
        originalCard: card,
        uiControls: {
          queryBuilderMode: "notebook",
          isModifiedFromNotebook: true,
        },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when not modified from the notebook editor", () => {
      const state = getBaseState({
        card,
        originalCard: card,
        uiControls: {
          queryBuilderMode: "notebook",
          isModifiedFromNotebook: false,
        },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });

  describe("when creating a native question", () => {
    function getNativeCard(query: string) {
      return createMockCard({
        dataset_query: {
          type: "native",
          database: SAMPLE_DB_ID,
          native: createMockNativeQuery({ query }),
        },
      });
    }

    it("warns when the new native query is non-empty", () => {
      const state = getBaseState({
        card: getNativeCard("SELECT 1"),
        uiControls: { queryBuilderMode: "view" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(true);
    });

    it("does not warn when the new native query is empty", () => {
      const state = getBaseState({
        card: getNativeCard(""),
        uiControls: { queryBuilderMode: "view" },
      });
      expect(getShouldShowUnsavedChangesWarning(state)).toBe(false);
    });
  });
});

describe("getFilteredTimelines", () => {
  function getTimelineWithEvents(
    events: Array<{ id: number; name: string; timestamp: string }>,
  ) {
    return createMockTimeline({
      id: 1,
      events: events.map((event) => createMockTimelineEvent(event)),
    });
  }

  function getEventNames(timelines: ReturnType<typeof getFilteredTimelines>) {
    return timelines.flatMap((timeline) =>
      (timeline.events ?? []).map((event) => event.name),
    );
  }

  // metabase#23336: when a timeseries is bucketed by an absolute unit (e.g. year),
  // the last x value is the *start* of the last bucket (Jan 1, 2024 for "count of
  // orders by year"). Filtering events to [xDomain[0], xDomain[1]] drops any event
  // that lands later within that final bucket. getFilteredTimelines must extend the
  // domain by one data interval so those last-period events remain visible.
  it("keeps events that fall within the last period of an absolute-unit timeseries (metabase#23336)", () => {
    const xDomain: [dayjs.Dayjs, dayjs.Dayjs] = [
      dayjs.utc("2020-01-01T00:00:00Z"),
      dayjs.utc("2024-01-01T00:00:00Z"),
    ];
    const dataInterval: TimeSeriesInterval = { count: 1, unit: "year" };

    const timeline = getTimelineWithEvents([
      { id: 1, name: "In range", timestamp: "2022-05-01T12:00:00Z" },
      { id: 2, name: "In last period", timestamp: "2024-09-10T12:00:00Z" },
      { id: 3, name: "Beyond range", timestamp: "2025-06-01T12:00:00Z" },
    ]);

    const filtered = getFilteredTimelines.resultFunc(
      [timeline],
      xDomain,
      dataInterval,
    );

    expect(getEventNames(filtered)).toEqual(["In range", "In last period"]);
  });

  it("does not extend the domain when there is no data interval", () => {
    const xDomain: [dayjs.Dayjs, dayjs.Dayjs] = [
      dayjs.utc("2020-01-01T00:00:00Z"),
      dayjs.utc("2024-01-01T00:00:00Z"),
    ];

    const timeline = getTimelineWithEvents([
      { id: 1, name: "In range", timestamp: "2022-05-01T12:00:00Z" },
      { id: 2, name: "In last period", timestamp: "2024-09-10T12:00:00Z" },
    ]);

    const filtered = getFilteredTimelines.resultFunc([timeline], xDomain, null);

    expect(getEventNames(filtered)).toEqual(["In range"]);
  });
});
