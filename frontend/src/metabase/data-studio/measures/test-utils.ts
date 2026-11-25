import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupDatabaseEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { screen, waitFor } from "__support__/ui";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Measure, Segment, TestStageSpec } from "metabase-types/api";
import {
  COMMON_DATABASE_FEATURES,
  createMockCard,
  createMockMeasure,
  createMockSegment,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersProductIdField,
  createOrdersTable,
  createProductsIdField,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

export { ORDERS, ORDERS_ID, PRODUCTS, SAMPLE_DB_ID };

export const TOTAL_SEGMENT_ID = 12;
export const LARGE_TOTAL_SEGMENT_ID = 11;
export const NESTED_SEGMENT_ID = 13;
export const TOTAL_MEASURE_ID = 22;
export const ORDERS_COUNT_METRIC_ID = 31;
export const ROWS_MEASURE_ID = 21;

// The H2 sample database supports offset and DistinctIf.
const SAMPLE_DATABASE = createSampleDatabase({
  tables: [],
  features: [
    ...COMMON_DATABASE_FEATURES,
    "window-functions/offset",
    "distinct-where",
  ],
});

function ordersDefinition(stage: TestStageSpec): Measure["definition"] {
  return Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID }, ...stage }],
  });
}

function createOrdersSegment(opts: Partial<Segment>): Segment {
  return createMockSegment({ table_id: ORDERS_ID, ...opts });
}

export function createOrdersMeasure(opts: Partial<Measure>): Measure {
  return createMockMeasure({ table_id: ORDERS_ID, ...opts });
}

export const COUNT_DEFINITION = ordersDefinition({
  aggregations: [{ type: "operator", operator: "count" }],
});

export const TOTAL_MEASURE = createOrdersMeasure({
  id: TOTAL_MEASURE_ID,
  name: "TotalMeasure",
  definition: ordersDefinition({
    aggregations: [
      {
        type: "operator",
        operator: "sum",
        args: [{ type: "column", fieldId: ORDERS.TOTAL }],
      },
    ],
  }),
});

// Neither segment the tests pick comes first, by position or by id, so a
// resolver that always returns the first one fails.
const ROWS_MEASURE = createOrdersMeasure({
  id: ROWS_MEASURE_ID,
  name: "RowsMeasure",
  definition: COUNT_DEFINITION,
});

const ORDERS_SEGMENTS = [
  createOrdersSegment({ id: LARGE_TOTAL_SEGMENT_ID, name: "LargeTotal" }),
  createOrdersSegment({ id: TOTAL_SEGMENT_ID, name: "TotalSegment" }),
  createOrdersSegment({ id: NESTED_SEGMENT_ID, name: "NestedSegment" }),
];

const ORDERS_COUNT_METRIC = createMockCard({
  id: ORDERS_COUNT_METRIC_ID,
  name: "OrdersCount",
  type: "metric",
  table_id: ORDERS_ID,
  database_id: SAMPLE_DB_ID,
  dataset_query: COUNT_DEFINITION,
});

type SetupMeasureMetadataOpts = {
  measures?: Measure[];
};

/**
 * Mocks the requests of a measure page: the Orders table metadata (with
 * segments, measures and a metric on Orders), Products behind its FK, the
 * database and the root collection.
 */
export function setupMeasureMetadata({
  // TotalMeasure comes second, by position and by id, so a resolver that
  // always returns the first measure fails.
  measures = [ROWS_MEASURE, TOTAL_MEASURE],
}: SetupMeasureMetadataOpts = {}) {
  setupDatabaseEndpoints(SAMPLE_DATABASE);
  setupCollectionsEndpoints({ collections: [] });

  const ordersFields = createOrdersTable().fields ?? [];
  setupTableQueryMetadataEndpoint(
    createOrdersTable({
      db: SAMPLE_DATABASE,
      // query_metadata hydrates the FK target, which the page follows to load
      // Products for implicit joins.
      fields: ordersFields.map((field) =>
        field.id === ORDERS.PRODUCT_ID
          ? createOrdersProductIdField({ target: createProductsIdField() })
          : field,
      ),
      segments: ORDERS_SEGMENTS,
      measures,
      metrics: [ORDERS_COUNT_METRIC],
    }),
  );
  setupTableQueryMetadataEndpoint(createProductsTable({ db: SAMPLE_DATABASE }));
}

/**
 * Sets up the enterprise plugins and returns the store state of an admin on
 * an instance with the `library` feature, as for Data Studio published tables.
 */
export function setupEnterpriseMeasureState() {
  setupEnterprisePlugins();
  return createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
  });
}

type EnterCustomExpressionOpts = {
  formula: string;
  name?: string;
  button: "Done" | "Update";
};

/** Replaces the formula in the open expression editor and submits it. */
export async function enterCustomExpression({
  formula,
  name,
  button,
}: EnterCustomExpressionOpts) {
  const input = await screen.findByTestId("custom-expression-query-editor");
  await waitFor(() => expect(input).toHaveProperty("readOnly", false));
  await userEvent.clear(input);
  await userEvent.type(input, formula);
  await userEvent.tab();
  if (name != null) {
    const nameInput = screen.getByTestId("expression-name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, name);
  }
  const submitButton = screen.getByRole("button", { name: button });
  await waitFor(() => expect(submitButton).toBeEnabled());
  await userEvent.click(submitButton);
}

function withoutUuids(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutUuids);
  }
  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "lib/uuid")
        .map(([key, item]) => [key, withoutUuids(item)]),
    );
  }
  return value;
}

/**
 * Returns the aggregations of the first stage of the measure definition in a
 * `POST /api/measure` or `PUT /api/measure/:id` body, without `lib/uuid`s.
 */
export function getAggregationFromBody(body: unknown): unknown {
  const definition = Object(Object(body).definition);
  const [stage] = Array.isArray(definition.stages) ? definition.stages : [];
  return withoutUuids(Object(stage).aggregation);
}
