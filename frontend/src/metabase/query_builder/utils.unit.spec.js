import Question from "metabase-lib/lib/Question";
import Aggregation from "metabase-lib/lib/queries/structured/Aggregation";
import Breakout from "metabase-lib/lib/queries/structured/Breakout";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import Join from "metabase-lib/lib/queries/structured/Join";
import OrderBy from "metabase-lib/lib/queries/structured/OrderBy";
import {
  SAMPLE_DATABASE,
  ORDERS,
  PRODUCTS,
  metadata,
} from "__support__/sample_database_fixture";
import { normalizeQuery } from "./selectors";

function toFieldRef(field) {
  return ["field", field.id, null];
}

function sortFields(f1, f2) {
  return JSON.stringify(f2).localeCompare(JSON.stringify(f1));
}

function getTableFields(tableId) {
  const table = SAMPLE_DATABASE.tables.find(table => table.id === tableId);
  return table.fields.map(toFieldRef).sort(sortFields);
}

function getQuestion({ type = "query", query = {} } = {}) {
  const queryObjectKey = type === "query" ? "query" : "native";
  let queryObject = {};

  if (type === "query") {
    queryObject = {
      ...query,
      "source-table": ORDERS.id,
    };
  } else {
    queryObject = query;
  }

  return new Question({
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type,
      database: SAMPLE_DATABASE.id,
      [queryObjectKey]: queryObject,
    },
  });
}

function setup(questionOpts) {
  const question = getQuestion(questionOpts);
  const query = question.query();
  const tableMetadata = question.isStructured()
    ? metadata.table(query.sourceTableId())
    : null;
  return { question, query, datasetQuery: query.datasetQuery(), tableMetadata };
}

const FEW_ORDERS_TABLE_FIELDS = [
  ORDERS.ID,
  ORDERS.TOTAL,
  ORDERS.CREATED_AT,
].map(toFieldRef);

const TEST_CLAUSE = {
  AGGREGATION: ["count"],
  BREAKOUT: toFieldRef(ORDERS.CREATED_AT),
  FILTER: [">=", toFieldRef(ORDERS.TOTAL), 20],
  ORDER_BY: ["asc", ["aggregation", 0]],
  JOIN: {
    alias: "Products",
    condition: ["=", toFieldRef(ORDERS.PRODUCT_ID), toFieldRef(PRODUCTS.ID)],
  },
};

describe("normalizeQuery", () => {
  it("does nothing if query is nullish", () => {
    expect(normalizeQuery(null)).toBe(null);
    expect(normalizeQuery(undefined)).toBe(undefined);
  });

  describe("structured query", () => {
    it("handles null in filter clauses", () => {
      const FILTER_WITH_NULL = ["=", ["field", ORDERS.TOTAL, null], null];

      const { datasetQuery } = setup({
        query: {
          filter: FILTER_WITH_NULL,
        },
      });

      const { query: normalizedQuery } = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual({
        ...datasetQuery.query,
        filter: FILTER_WITH_NULL,
      });
    });

    it("adds explicit list of fields if missing", () => {
      const { datasetQuery, query, tableMetadata } = setup();
      const expectedFields = getTableFields(query.sourceTableId());

      const normalizedQuery = normalizeQuery(datasetQuery, tableMetadata);

      expect(normalizedQuery.query).toEqual(
        expect.objectContaining({
          fields: expectedFields,
        }),
      );
    });

    it("sorts query fields if they're set explicitly", () => {
      const { datasetQuery, tableMetadata } = setup({
        query: { fields: FEW_ORDERS_TABLE_FIELDS },
      });

      const normalizedQuery = normalizeQuery(datasetQuery, tableMetadata);

      expect(normalizedQuery.query.fields).toEqual(
        FEW_ORDERS_TABLE_FIELDS.sort(sortFields),
      );
    });

    it("does nothing to query fields if table metadata is not provided", () => {
      const { datasetQuery } = setup({
        query: { fields: FEW_ORDERS_TABLE_FIELDS },
      });

      const normalizedQuery = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual(datasetQuery);
    });

    it("converts clauses into plain MBQL objects", () => {
      const { datasetQuery } = setup({
        query: {
          aggregation: [new Aggregation(TEST_CLAUSE.AGGREGATION)],
          breakout: [new Breakout(TEST_CLAUSE.BREAKOUT)],
          filter: [new Filter(TEST_CLAUSE.FILTER)],
          joins: [new Join(TEST_CLAUSE.JOIN)],
          "order-by": [new OrderBy(TEST_CLAUSE.ORDER_BY)],
        },
      });

      const { query: normalizedQuery } = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual({
        ...datasetQuery.query,
        aggregation: [TEST_CLAUSE.AGGREGATION],
        breakout: [TEST_CLAUSE.BREAKOUT],
        filter: [TEST_CLAUSE.FILTER],
        joins: [TEST_CLAUSE.JOIN],
        "order-by": [TEST_CLAUSE.ORDER_BY],
      });
      expect(normalizedQuery.aggregation[0]).not.toBeInstanceOf(Aggregation);
      expect(normalizedQuery.breakout[0]).not.toBeInstanceOf(Breakout);
      expect(normalizedQuery.filter[0]).not.toBeInstanceOf(Filter);
      expect(normalizedQuery.joins[0]).not.toBeInstanceOf(Join);
      expect(normalizedQuery["order-by"][0]).not.toBeInstanceOf(OrderBy);
    });

    it("does nothing to clauses if they're plain MBQL already", () => {
      const { datasetQuery } = setup({
        query: {
          aggregation: [TEST_CLAUSE.AGGREGATION],
          breakout: [TEST_CLAUSE.BREAKOUT],
          filter: [TEST_CLAUSE.FILTER],
          joins: [TEST_CLAUSE.JOIN],
          "order-by": [TEST_CLAUSE.ORDER_BY],
        },
      });

      const { query: normalizedQuery } = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual(datasetQuery.query);
      expect(normalizedQuery.aggregation[0]).not.toBeInstanceOf(Aggregation);
      expect(normalizedQuery.breakout[0]).not.toBeInstanceOf(Breakout);
      expect(normalizedQuery.filter[0]).not.toBeInstanceOf(Filter);
      expect(normalizedQuery.joins[0]).not.toBeInstanceOf(Join);
      expect(normalizedQuery["order-by"][0]).not.toBeInstanceOf(OrderBy);
    });
  });

  describe("native query", () => {
    it("assigns empty object to template tags if missing", () => {
      const { datasetQuery } = setup({
        type: "native",
      });

      const normalizedQuery = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual({
        ...datasetQuery,
        native: {
          ...datasetQuery.native,
          "template-tags": {},
        },
      });
    });

    it("does nothing to template tags if they're set explicitly", () => {
      const { datasetQuery } = setup({
        type: "native",
        query: {
          "template-tags": {
            total: {
              name: "total",
              type: "dimension",
            },
          },
        },
      });

      const normalizedQuery = normalizeQuery(datasetQuery);

      expect(normalizedQuery).toEqual(datasetQuery);
    });
  });
});
