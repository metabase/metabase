import { createMockMetadata } from "__support__/metadata";
import { getNextId } from "__support__/utils";
import * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
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
              definition: createMockStructuredQuery({
                "source-table": ORDERS_ID,
                filter: [">", ["field", ORDERS.TOTAL, null], 30],
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
        }),
      ],
    }),
  ],
});

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
  expressions: [
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
  ],
});
export const stageIndex = -1;

function findField(name: string) {
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
  table: T,
): {
  [K in keyof T]: Lib.ColumnMetadata;
} {
  const res = {} as unknown as {
    [K in keyof T]: Lib.ColumnMetadata;
  };

  for (const name in table) {
    res[name] = findField(name);
  }
  return res;
}

function findSegment(name: string) {
  const segments = Lib.availableSegments(query, stageIndex);
  for (const segment of segments) {
    const info = Lib.displayInfo(query, stageIndex, segment);
    if (info.displayName === name) {
      return segment;
    }
  }
  throw new Error(`Could not find segment: ${name}`);
}

function findMetric(name: string) {
  const metrics = Lib.availableMetrics(query, stageIndex);
  for (const metric of metrics) {
    const info = Lib.displayInfo(query, stageIndex, metric);
    if (info.displayName === name) {
      return metric;
    }
  }
  throw new Error(`Could not find metric: ${name}`);
}

export const fields = {
  orders: findFields(ORDERS),
  people: findFields(PEOPLE),
  products: findFields(PRODUCTS),
};

export const expressions = {
  BOOL: findField("bool"),
  FOO: findField("foo"),
  NAME_WITH_BRACKETS: findField("name with [brackets]"),
  NAME_WITH_SLASH: findField("name with \\ slash"),
  STRINGLY: findField("stringly"),
  BAR_UPPER: findField("BAR"),
  BAR_LOWER: findField("bar"),
};

export const segments = {
  EXPENSIVE_THINGS: findSegment("Expensive Things"),
};

export const metrics = {
  FOO: findMetric("Foo Metric"),
};

export const sharedMetadata = metadata;
