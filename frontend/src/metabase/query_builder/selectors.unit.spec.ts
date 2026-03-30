import { assoc } from "icepick";

import { createMockEntitiesState } from "__support__/store";
import {
  getIsResultDirty,
  getIsVisualized,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestion,
  getQuestionDetailsTimelineDrawerState,
} from "metabase/query_builder/selectors";
import registerVisualizations from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  ConcreteFieldReference,
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
import type {
  QueryBuilderState,
  QueryBuilderUIControls,
  Range,
} from "metabase-types/store";
import {
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
  createMockState,
} from "metabase-types/store/mocks";

registerVisualizations();

function getBaseState({
  uiControls = {},
  ...state
}: Partial<Omit<QueryBuilderState, "uiControls">> & {
  uiControls?: Partial<QueryBuilderUIControls>;
} = {}) {
  return createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
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
});
