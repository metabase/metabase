import { assoc, assocIn } from "icepick";

import { createMockEntitiesState } from "__support__/store";
import {
  getQuestion,
  getIsResultDirty,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestionDetailsTimelineDrawerState,
} from "metabase/query_builder/selectors";
import Question from "metabase-lib/v1/Question";
import { createMockTable } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  createMockState,
  createMockQueryBuilderState,
  createMockQueryBuilderUIControlsState,
} from "metabase-types/store/mocks";

function getBaseState({ uiControls = {}, ...state } = {}) {
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

function getBaseCard(opts) {
  return {
    ...opts,
    dataset_query: {
      database: 1,
      ...opts.dataset_query,
    },
  };
}

describe("getQuestion", () => {
  it("should be nothing if card data is missing", () => {
    const state = getBaseState({ card: null });
    expect(getQuestion(state)).toBe(undefined);
  });

  it("should return question instance correctly", () => {
    const card = {
      id: 5,
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": 1,
        },
      },
    };

    const question = getQuestion(getBaseState({ card }));

    expect(question).toBeInstanceOf(Question);
    expect(question._doNotCallSerializableCard()).toEqual(card);
  });

  it("should return composed dataset when dataset is open", () => {
    const card = {
      id: 1,
      type: "model",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
      },
    };

    const question = getQuestion(getBaseState({ card }));

    expect(question.card()).toEqual(
      assocIn(card, ["dataset_query", "query", "source-table"], "card__1"),
    );
  });

  it("should return real dataset when dataset is open in 'dataset' QB mode", () => {
    const card = {
      id: 5,
      type: "model",
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": 1,
        },
      },
    };

    const question = getQuestion(
      getBaseState({
        card,
        uiControls: {
          queryBuilderMode: "dataset",
        },
      }),
    );

    expect(question.card()).toEqual(assoc(card, "displayIsLocked", true));
  });
});

describe("getIsResultDirty", () => {
  describe("structured query", () => {
    function getCard(query) {
      return getBaseCard({ dataset_query: { type: "query", query } });
    }

    function getState(lastRunCardQuery, cardQuery) {
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
      const aggregation = ["count"];
      const breakout = ["field", ORDERS.CREATED_AT, null];
      const filter = [">", ["field", ORDERS.TOTAL, null], 20];
      const join = {
        alias: "Products",
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, null],
        ],
      };

      const state = getState(
        {
          aggregation: [aggregation],
          breakout: [breakout],
          filter,
          joins: [join],
        },
        {
          aggregation: [aggregation],
          breakout: [breakout],
          filter,
          joins: [join],
        },
      );

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
      const orderTableFieldRefs = orderTableFieldIds.map(id => [
        "field",
        id,
        null,
      ]);

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
    function getCard(native) {
      return getBaseCard({ dataset_query: { type: "native", native } });
    }

    function getState(lastRunCardQuery, cardQuery) {
      return getBaseState({
        card: getCard(cardQuery),
        lastRunCard: getCard(lastRunCardQuery),
      });
    }

    it("should not be dirty if template-tags is empty vs an empty object", () => {
      const state = getState({}, { "template-tags": {} });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if template-tags differ", () => {
      const state = getState(
        { "template-tags": { foo: {} } },
        { "template-tags": { bar: {} } },
      );
      expect(getIsResultDirty(state)).toBe(true);
    });

    describe("native editor selection/cursor", () => {
      function getStateWithSelectedQueryText(start, end) {
        return getBaseState({
          card: getBaseCard({
            dataset_query: {
              type: "native",
              native: { query: "1\n22\n333" },
            },
          }),
          uiControls: {
            nativeEditorSelectedRange: { start, end },
          },
        });
      }

      [
        [{ row: 0, column: 0 }, 0],
        [{ row: 1, column: 1 }, 3],
        [{ row: 2, column: 3 }, 8],
      ].forEach(([position, offset]) =>
        it(`should correctly determine the cursor offset for ${JSON.stringify(
          position,
        )}`, () => {
          const state = getStateWithSelectedQueryText(position, position);
          expect(getNativeEditorCursorOffset(state)).toBe(offset);
        }),
      );

      [
        [{ row: 0, column: 0 }, { row: 0, column: 0 }, ""],
        [{ row: 0, column: 0 }, { row: 2, column: 3 }, "1\n22\n333"],
        [{ row: 1, column: 0 }, { row: 1, column: 2 }, "22"],
      ].forEach(([start, end, text]) =>
        it(`should correctly get selected text from ${JSON.stringify(
          start,
        )} to ${JSON.stringify(end)}`, () => {
          const state = getStateWithSelectedQueryText(start, end);
          expect(getNativeEditorSelectedText(state)).toBe(text);
        }),
      );
    });
  });

  describe("models", () => {
    function getDataset(query) {
      return getBaseCard({
        id: 1,
        type: "model",
        dataset_query: { type: "query", query },
      });
    }

    function getState(state) {
      return getBaseState(state);
    }

    const dataset = getDataset({ "source-table": 1 });

    it("should not be dirty if model is not changed", () => {
      const state = getState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty if model is changed", () => {
      const state = getState({
        card: dataset,
        originalCard: dataset,
        lastRunCard: getDataset({ "source-table": 2 }),
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty if model simple mode is active", () => {
      const adHocDatasetCard = getDataset({ "source-table": "card__1" });
      const state = getState({
        card: adHocDatasetCard,
        originalCard: dataset,
        lastRunCard: adHocDatasetCard,
      });
      expect(getIsResultDirty(state)).toBe(false);
    });

    it("should be dirty when building a new question on a model", () => {
      const card = getBaseCard({
        dataset_query: {
          type: "query",
          query: {
            aggregate: [["count"]],
            "source-table": "card__1",
          },
        },
      });
      const state = getState({
        card,
        originalCard: dataset,
        lastRunCard: dataset,
      });
      expect(getIsResultDirty(state)).toBe(true);
    });

    it("should not be dirty when the last run question is the composed model and the current question is equivalent to the original", () => {
      const adHocDatasetCard = getDataset({ "source-table": "card__1" });
      const state = getState({
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
    const state = {
      qb: {
        uiControls: {
          questionDetailsTimelineDrawerState: "foo",
        },
      },
    };
    expect(getQuestionDetailsTimelineDrawerState(state)).toBe("foo");
  });
});
