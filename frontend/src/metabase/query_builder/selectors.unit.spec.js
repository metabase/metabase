import { assoc, assocIn } from "icepick";
import {
  getQuestion,
  getIsResultDirty,
  getNativeEditorCursorOffset,
  getNativeEditorSelectedText,
  getQuestionDetailsTimelineDrawerState,
} from "metabase/query_builder/selectors";
import {
  ORDERS,
  PRODUCTS,
  state as sampleState,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/Question";
import Aggregation from "metabase-lib/queries/structured/Aggregation";
import Breakout from "metabase-lib/queries/structured/Breakout";
import Filter from "metabase-lib/queries/structured/Filter";
import Join from "metabase-lib/queries/structured/Join";

function getBaseState({ uiControls = {}, ...state } = {}) {
  return {
    ...sampleState,
    qb: {
      ...state,
      uiControls: {
        queryBuilderMode: "view",
        ...uiControls,
      },
    },
  };
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
      id: 5,
      dataset: true,
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": 1,
        },
      },
    };

    const question = getQuestion(getBaseState({ card }));

    expect(question.card()).toEqual(
      assocIn(card, ["dataset_query", "query", "source-table"], "card__5"),
    );
  });

  it("should return real dataset when dataset is open in 'dataset' QB mode", () => {
    const card = {
      id: 5,
      dataset: true,
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
      const breakout = ORDERS.CREATED_AT.reference();
      const filter = [">=", ORDERS.TOTAL.reference(), 20];
      const join = {
        alias: "Products",
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID.id, null],
          ["field", PRODUCTS.ID.id, null],
        ],
      };

      const state = getState(
        {
          aggregation: [new Aggregation(aggregation)],
          breakout: [new Breakout(breakout)],
          filter: [new Filter(filter)],
          joins: [new Join(join)],
        },
        {
          aggregation: [aggregation],
          breakout: [breakout],
          filter: [filter],
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
      const state = getState(
        { "source-table": 1 },
        {
          "source-table": 1,
          fields: [
            ["field", 1, null],
            ["field", 2, null],
            ["field", 3, null],
            ["field", 4, null],
            ["field", 5, null],
            ["field", 6, null],
            ["field", 7, null],
          ],
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
        dataset: true,
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
