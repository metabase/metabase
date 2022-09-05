import Question from "metabase-lib/lib/Question";
import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";
import { createMockColumn } from "metabase-types/types/mocks/dataset";
import {
  ORDERS,
  PEOPLE,
  SAMPLE_DATABASE,
  metadata,
} from "__support__/sample_database_fixture";

const NUMBER_AND_DATE_FILTERS = ["<", ">", "=", "!="];
const OTHER_FILTERS = ["=", "!="];

const DEFAULT_NUMERIC_CELL_VALUE = 42;

const AGGREGATED_QUERY = {
  aggregation: [["count"]],
  breakout: ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "month" }],
  "source-table": ORDERS.id,
};

const AGGREGATED_QUESTION = {
  display: "table",
  dataset_query: {
    type: "query",
    query: AGGREGATED_QUERY,
    database: SAMPLE_DATABASE.id,
  },
};

const NESTED_QUESTION_SOURCE_TABLE_ID = "card__58";
const NESTED_QUESTION = {
  display: "table",
  dataset_query: {
    type: "query",
    query: {
      "source-table": NESTED_QUESTION_SOURCE_TABLE_ID,
    },
    database: SAMPLE_DATABASE.id,
  },
};

function setup({
  question = ORDERS.question(),
  column,
  value = DEFAULT_NUMERIC_CELL_VALUE,
} = {}) {
  const actions = QuickFilterDrill({
    question,
    clicked: { column, value },
  });
  return {
    actions,
    cellValue: value,
  };
}

describe("QuickFilterDrill", () => {
  it("should not be valid for top level actions", () => {
    const actions = QuickFilterDrill({ question: ORDERS.question() });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for native questions", () => {
    const actions = QuickFilterDrill({
      question: new Question(
        {
          dataset_query: {
            type: "native",
            native: {
              query: "SELECT * FROM ORDERS",
            },
            database: SAMPLE_DATABASE.id,
          },
        },
        metadata,
      ),
      column: createMockColumn({
        name: "TOTAL",
        field_ref: ["field", "TOTAL", { base_type: "type/BigInteger" }],
        base_type: "type/BigInteger",
        source: "native",
      }),
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked column is missing", () => {
    const { actions } = setup({ column: null });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid when clicked value is undefined", () => {
    const actions = QuickFilterDrill({
      question: ORDERS.question(),
      clicked: {
        column: ORDERS.TOTAL.column(),
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for PK cells", () => {
    const { actions } = setup({ column: ORDERS.ID.column() });
    expect(actions).toHaveLength(0);
  });

  describe("FK cells", () => {
    const FK_VALUE = 1;
    const { actions } = setup({
      column: ORDERS.PRODUCT_ID.column(),
      value: FK_VALUE,
    });

    it("should return only 'view this records' filter", () => {
      expect(actions).toMatchObject([{ name: "view-fks" }]);
    });

    it("should apply 'view this records' filter correctly", () => {
      const [action] = actions;
      const card = action.question().card();
      expect(card.dataset_query.query).toEqual({
        "source-table": ORDERS.id,
        filter: ["=", ORDERS.PRODUCT_ID.reference(), FK_VALUE],
      });
    });
  });

  describe("numeric cells", () => {
    const clickedField = ORDERS.TOTAL;
    const { actions } = setup({ column: clickedField.column() });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          filter: [
            operator,
            clickedField.reference(),
            DEFAULT_NUMERIC_CELL_VALUE,
          ],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("joined numeric field cell", () => {
    const joinedFieldRef = ["field", ORDERS.TOTAL.id, { "join-alias": "foo" }];
    const { actions, cellValue } = setup({
      column: ORDERS.TOTAL.column({ field_ref: joinedFieldRef }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, joinedFieldRef, cellValue],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("aggregated numeric cell", () => {
    const { actions, cellValue } = setup({
      question: new Question(AGGREGATED_QUESTION, metadata),
      column: createMockColumn({
        name: "count",
        field_ref: ["aggregation", 0],
        base_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        source: "aggregation",
      }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-query": AGGREGATED_QUERY,
          filter: [
            operator,
            ["field", "count", { "base-type": "type/BigInteger" }],
            cellValue,
          ],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("numeric field cell from a nested query", () => {
    const question = new Question(NESTED_QUESTION);
    question.query().isEditable = () => true;

    const fieldRef = ["field", "count", { "base-type": "type/BigInteger" }];
    const { actions, cellValue } = setup({
      question,
      column: createMockColumn({
        name: "count",
        field_ref: fieldRef,
        base_type: "type/BigInteger",
        semantic_type: "type/Quantity",
        source: "aggregation",
      }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": NESTED_QUESTION_SOURCE_TABLE_ID,
          filter: [operator, fieldRef, cellValue],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("date-time cells", () => {
    const CELL_VALUE = new Date().toISOString();
    const { actions } = setup({
      column: ORDERS.CREATED_AT.column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": ORDERS.id,
          filter: [operator, ORDERS.CREATED_AT.reference(), CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("string cells", () => {
    const CELL_VALUE = "Joe";
    const { actions } = setup({
      question: PEOPLE.question(),
      column: PEOPLE.NAME.column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, PEOPLE.NAME.reference(), CELL_VALUE],
        });
        expect(card.display).toBe("table");
      });
    });
  });

  describe("numeric cells, but not semantically numbers", () => {
    const { actions, cellValue } = setup({
      question: PEOPLE.question(),
      column: PEOPLE.ZIP.column(),
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(operator => ({
        name: operator,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const operator = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const card = action.question().card();
        expect(card.dataset_query.query).toEqual({
          "source-table": PEOPLE.id,
          filter: [operator, PEOPLE.ZIP.reference(), cellValue],
        });
        expect(card.display).toBe("table");
      });
    });
  });
});
