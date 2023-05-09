import { createMockMetadata } from "__support__/metadata";
import QuickFilterDrill from "metabase/modes/components/drill/QuickFilterDrill";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const ordersTable = metadata.table(ORDERS_ID);
const peopleTable = metadata.table(PEOPLE_ID);

const NUMBER_AND_DATE_FILTERS = [
  { name: "<", operator: "<" },
  { name: ">", operator: ">" },
  { name: "=", operator: "=" },
  { name: "≠", operator: "!=" },
];

const NULL_FILTERS = [
  { name: "=", operator: "is-null" },
  { name: "≠", operator: "not-null" },
];

const OTHER_FILTERS = [
  { name: "=", operator: "=" },
  { name: "≠", operator: "!=" },
];

const DEFAULT_NUMERIC_CELL_VALUE = 42;

const AGGREGATED_QUERY = {
  aggregation: [["count"]],
  breakout: ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
  "source-table": ORDERS_ID,
};

const AGGREGATED_QUESTION = {
  display: "table",
  dataset_query: {
    type: "query",
    query: AGGREGATED_QUERY,
    database: SAMPLE_DB_ID,
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
    database: SAMPLE_DB_ID,
  },
};

function setup({
  question = ordersTable.question(),
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
    const actions = QuickFilterDrill({ question: ordersTable.question() });
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
            database: SAMPLE_DB_ID,
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
      question: ordersTable.question(),
      clicked: {
        column: metadata.field(ORDERS.TOTAL).column(),
        value: undefined,
      },
    });
    expect(actions).toHaveLength(0);
  });

  it("should not be valid for PK cells", () => {
    const { actions } = setup({ column: metadata.field(ORDERS.ID).column() });
    expect(actions).toHaveLength(0);
  });

  describe("numeric cells", () => {
    const clickedField = metadata.field(ORDERS.TOTAL);
    const { actions } = setup({ column: clickedField.column() });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": ORDERS_ID,
          filter: [
            operator,
            clickedField.reference(),
            DEFAULT_NUMERIC_CELL_VALUE,
          ],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("joined numeric field cell", () => {
    const joinedFieldRef = ["field", ORDERS.TOTAL, { "join-alias": "foo" }];
    const { actions, cellValue } = setup({
      column: metadata
        .field(ORDERS.TOTAL)
        .column({ field_ref: joinedFieldRef }),
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": ORDERS_ID,
          filter: [operator, joinedFieldRef, cellValue],
        });
        expect(question.display()).toBe("table");
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
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-query": AGGREGATED_QUERY,
          filter: [
            operator,
            ["field", "count", { "base-type": "type/BigInteger" }],
            cellValue,
          ],
        });
        expect(question.display()).toBe("table");
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
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": NESTED_QUESTION_SOURCE_TABLE_ID,
          filter: [operator, fieldRef, cellValue],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("numeric cells with null values", () => {
    const clickedField = metadata.field(ORDERS.TOTAL);
    const { actions } = setup({ column: clickedField.column(), value: null });

    it("should return correct filters", () => {
      const filters = NULL_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NULL_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": ORDERS_ID,
          filter: [operator, clickedField.reference()],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("date-time cells", () => {
    const CELL_VALUE = new Date().toISOString();
    const { actions } = setup({
      column: metadata.field(ORDERS.CREATED_AT).column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = NUMBER_AND_DATE_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = NUMBER_AND_DATE_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": ORDERS_ID,
          filter: [
            operator,
            metadata.field(ORDERS.CREATED_AT).reference(),
            CELL_VALUE,
          ],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("string cells", () => {
    const CELL_VALUE = "Joe";
    const { actions } = setup({
      question: peopleTable.question(),
      column: metadata.field(PEOPLE.NAME).column(),
      value: CELL_VALUE,
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": PEOPLE_ID,
          filter: [
            operator,
            metadata.field(PEOPLE.NAME).reference(),
            CELL_VALUE,
          ],
        });
        expect(question.display()).toBe("table");
      });
    });
  });

  describe("numeric cells, but not semantically numbers", () => {
    const { actions, cellValue } = setup({
      question: peopleTable.question(),
      column: metadata.field(PEOPLE.ZIP).column(),
    });

    it("should return correct filters", () => {
      const filters = OTHER_FILTERS.map(({ name }) => ({
        name,
      }));
      expect(actions).toMatchObject(filters);
    });

    actions.forEach((action, i) => {
      const { operator } = OTHER_FILTERS[i];
      it(`should correctly apply "${operator}" filter`, () => {
        const question = action.question();
        expect(question.datasetQuery().query).toEqual({
          "source-table": PEOPLE_ID,
          filter: [operator, metadata.field(PEOPLE.ZIP).reference(), cellValue],
        });
        expect(question.display()).toBe("table");
      });
    });
  });
});
