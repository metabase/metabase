import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import * as Lib from "metabase-lib";
import {
  type ExpressionClauseOpts,
  createQuery,
  createQueryWithClauses,
} from "metabase-lib/test-helpers";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockMeasure,
  createMockSegment,
  createMockStructuredDatasetQuery,
  createMockStructuredQuery,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      features: [
        ...COMMON_DATABASE_FEATURES,
        "expressions/date",
        "expressions/integer",
        "expressions/date",
      ],
      tables: [
        createPeopleTable(),
        createProductsTable(),
        createReviewsTable(),
        createOrdersTable({
          segments: [
            createMockSegment({
              id: getNextId(),
              name: "Expensive Things",
              table_id: ORDERS_ID,
              definition: createMockStructuredDatasetQuery({
                database: 1,
                query: {
                  "source-table": ORDERS_ID,
                  filter: [">", ["field", ORDERS.TOTAL, null], 30],
                },
              }),
            }),
          ],
          metrics: [
            createMockCard({
              id: getNextId(),
              name: "Foo Metric",
              type: "metric",
              table_id: ORDERS_ID,
              dataset_query: createMockStructuredDatasetQuery({
                database: SAMPLE_DB_ID,
                query: createMockStructuredQuery({
                  "source-table": ORDERS_ID,
                  aggregation: [["sum", ["field", ORDERS.TOTAL, {}]]],
                }),
              }),
            }),
          ],
          measures: [
            createMockMeasure({
              id: getNextId(),
              name: "Bar Measure",
              table_id: ORDERS_ID,
              definition: createMockStructuredDatasetQuery({
                database: SAMPLE_DB_ID,
                query: createMockStructuredQuery({
                  "source-table": ORDERS_ID,
                  aggregation: [["sum", ["field", ORDERS.TOTAL, {}]]],
                }),
              }),
            }),
          ],
        }),
      ],
    }),
  ],
});

const exprs: ExpressionClauseOpts[] = [
  {
    name: "foo",
    operator: "+",
    args: [1, 2],
  },
  {
    name: "bool",
    operator: "=",
    args: [1, 1],
  },
  {
    name: "name with [brackets]",
    operator: "+",
    args: [1, 2],
  },
  {
    name: "name with \\ slash",
    operator: "+",
    args: [1, 2],
  },
  {
    name: "stringly",
    operator: "concat",
    args: ["foo", "bar"],
  },
  {
    name: "bar",
    operator: "+",
    args: [1, 2],
  },
  {
    name: "BAR",
    operator: "+",
    args: [1, 2],
  },
];

export const query = createQueryWithClauses({
  query: createQuery({
    metadata,
    query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: createMockStructuredQuery({
        "source-table": ORDERS_ID,
        fields: [],
      }),
    }),
  }),
  expressions: exprs,
});

export const queryWithAggregation = createQueryWithClauses({
  query: createQuery({
    metadata,
    query: createMockStructuredDatasetQuery({
      database: SAMPLE_DB_ID,
      query: createMockStructuredQuery({
        "source-table": ORDERS_ID,
        fields: [],
        aggregation: [
          [
            "aggregation-options",
            ["sum", ["field", ORDERS.TOTAL, null]],
            { name: "Bar Aggregation", "display-name": "Bar Aggregation" },
          ],
        ],
      }),
    }),
  }),
  expressions: exprs,
});

export const stageIndex = -1;

export function findField(query: Lib.Query, name: string) {
  const columns = Lib.expressionableColumns(query, stageIndex);
  for (const column of columns) {
    const info = Lib.displayInfo(query, stageIndex, column);
    if (info.name === name) {
      return column;
    }
  }
  throw new Error(`Could not find field: ${name}`);
}

function findFields<const T extends { [key: string]: unknown }>(
  query: Lib.Query,
  table: T,
): {
  [K in keyof T]: Lib.ColumnMetadata;
} {
  const res = {} as unknown as {
    [K in keyof T]: Lib.ColumnMetadata;
  };

  for (const name in table) {
    res[name] = findField(query, name);
  }
  return res;
}

function findSegment(query: Lib.Query, name: string) {
  const segments = Lib.availableSegments(query, stageIndex);
  for (const segment of segments) {
    const info = Lib.displayInfo(query, stageIndex, segment);
    if (info.displayName === name) {
      return segment;
    }
  }
  throw new Error(`Could not find segment: ${name}`);
}

function findMetric(query: Lib.Query, name: string) {
  const metrics = Lib.availableMetrics(query, stageIndex);
  for (const metric of metrics) {
    const info = Lib.displayInfo(query, stageIndex, metric);
    if (info.displayName === name) {
      return metric;
    }
  }
  throw new Error(`Could not find metric: ${name}`);
}

function findMeasure(query: Lib.Query, name: string) {
  const measures = Lib.availableMeasures(query, stageIndex);
  for (const measure of measures) {
    const info = Lib.displayInfo(query, stageIndex, measure);
    if (info.displayName === name) {
      return measure;
    }
  }
  throw new Error(`Could not find measure: ${name}`);
}

function findAggregation(query: Lib.Query, name: string) {
  if (query !== queryWithAggregation) {
    return null;
  }
  const aggregations = Lib.aggregableColumns(query, stageIndex);
  for (const aggregation of aggregations) {
    const info = Lib.displayInfo(query, stageIndex, aggregation);
    if (info.displayName === name) {
      return aggregation;
    }
  }
  throw new Error(`Could not find aggregation: ${name}`);
}

export function findDimensions(query: Lib.Query) {
  const fields = {
    orders: findFields(query, ORDERS),
    people: findFields(query, PEOPLE),
    products: findFields(query, PRODUCTS),
  };

  const expressions = {
    BOOL: findField(query, "bool"),
    FOO: findField(query, "foo"),
    NAME_WITH_BRACKETS: findField(query, "name with [brackets]"),
    NAME_WITH_SLASH: findField(query, "name with \\ slash"),
    STRINGLY: findField(query, "stringly"),
    BAR_UPPER: findField(query, "BAR"),
    BAR_LOWER: findField(query, "bar"),
  };

  const segments = {
    EXPENSIVE_THINGS: findSegment(query, "Expensive Things"),
  };

  const metrics = {
    FOO: findMetric(query, "Foo Metric"),
  };

  const measures = {
    BAR: findMeasure(query, "Bar Measure"),
  };

  const aggregations = {
    BAR_AGGREGATION: findAggregation(query, "Bar Aggregation"),
  };

  return {
    fields,
    expressions,
    segments,
    metrics,
    measures,
    aggregations,
  };
}
export const { fields, expressions, segments, metrics, measures } =
  findDimensions(query);

export const sharedMetadata = metadata;
