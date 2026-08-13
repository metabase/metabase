/* eslint-disable import/order */

import { createMockStore, resetTestState } from "./setup";
import { TEST_SCHEMA } from "./fixtures";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";

import { avg, breakout, filter, orderBy, sum } from "..";

beforeEach(resetTestState);

describe("resolveDatasetQuery validation", () => {
  it("does not emit an explicit undefined time unit", () => {
    const field = TEST_SCHEMA.tables.orders.fields.createdAt;

    expect(breakout(field, { unit: undefined })).not.toHaveProperty("unit");
    expect(orderBy(field, "asc", { unit: undefined })).not.toHaveProperty(
      "unit",
    );
  });

  it("rejects unknown dynamic query properties", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())(
        { source: TEST_SCHEMA.tables.orders },
        // The runtime validator must receive a shape the public type rejects.
        { filter: [] } as never,
      ),
    ).rejects.toThrow("Dynamic queries only support");
  });

  it("rejects invalid limits with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        limit: 0,
      }),
    ).rejects.toThrow("Table query limit must be a positive integer.");
  });

  it("rejects cross-table query clauses with clear error messages", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        fields: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).rejects.toThrow(
      "Table query fields must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        filters: [filter(TEST_SCHEMA.tables.products.fields.price, "=", 10)],
      }),
    ).rejects.toThrow(
      "Table query filters must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [sum(TEST_SCHEMA.tables.products.fields.price)],
      }),
    ).rejects.toThrow(
      "Table query aggregations must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        breakouts: [TEST_SCHEMA.tables.products.fields.price],
      }),
    ).rejects.toThrow(
      "Table query breakouts must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        orderBys: [orderBy(TEST_SCHEMA.tables.products.fields.price, "desc")],
      }),
    ).rejects.toThrow(
      "Table query orderBys must belong to source table 1, but received table id 2.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [avg(TEST_SCHEMA.tables.orders.fields.amount)],
        breakouts: [breakout(TEST_SCHEMA.tables.orders.fields.status)],
        orderBys: [orderBy(TEST_SCHEMA.tables.orders.fields.amount, "desc")],
      }),
    ).rejects.toThrow(
      "Table query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        breakouts: [
          breakout(TEST_SCHEMA.tables.orders.fields.createdAt, {
            unit: "month",
          }),
        ],
        orderBys: [
          orderBy(TEST_SCHEMA.tables.orders.fields.createdAt, "desc", {
            unit: "year",
          }),
        ],
      }),
    ).rejects.toThrow(
      "Table query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
    );
  });

  it("rejects cross-table metric aggregations with clear error messages", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [TEST_SCHEMA.metrics.productRevenue],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations must belong to source table 1, but received mapped table ids 2.",
    );
  });

  it("rejects metric aggregations without source table metadata", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [{ type: "metric", id: 31 }],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations must include source table metadata.",
    );
  });

  it("rejects source-card metric aggregations under table sources", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.tables.orders,
        aggregations: [TEST_SCHEMA.metrics.questionRevenue],
      }),
    ).rejects.toThrow(
      "Table query metric aggregations cannot use source-card Metrics. Use a saved question source for source-card Metrics.",
    );
  });

  it("rejects unsupported saved question query clauses with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        fields: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
      }),
    ).rejects.toThrow(
      "Saved question queries only support source, filters, aggregations, breakouts, orderBys, limit, enabled, but received fields.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        limit: 0,
      }),
    ).rejects.toThrow("Saved question query limit must be a positive integer.");
  });

  it("rejects saved question clauses that leave the question's result columns", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        filters: [filter(TEST_SCHEMA.tables.orders.fields.id, "=", 1)],
      }),
    ).rejects.toThrow(
      "Saved question query filters must reference a result column of saved question 41, but received ID.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [avg(TEST_SCHEMA.tables.orders.fields.id)],
      }),
    ).rejects.toThrow(
      "Saved question query aggregations must reference a result column of saved question 41, but received ID.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [avg(TEST_SCHEMA.questions.ordersQuestion.columns[1])],
        breakouts: [TEST_SCHEMA.tables.orders.fields.id],
      }),
    ).rejects.toThrow(
      "Saved question query breakouts must reference a result column of saved question 41, but received ID.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        orderBys: [orderBy(TEST_SCHEMA.tables.orders.fields.id, "desc")],
      }),
    ).rejects.toThrow(
      "Saved question query orderBys must reference a result column of saved question 41, but received ID.",
    );
  });

  // These are rejected by the types too; the runtime guard keeps the failure
  // legible for JavaScript apps and hand-built query objects.
  it("rejects table-scoped references in saved question queries", async () => {
    await expect(
      // @ts-expect-error Segments belong to a table source
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        filters: [TEST_SCHEMA.tables.orders.segments.completed],
      }),
    ).rejects.toThrow(
      "Saved question query filters cannot use Segments, which belong to a table source.",
    );

    await expect(
      // @ts-expect-error Measures belong to a table source
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [TEST_SCHEMA.tables.orders.measures.revenue],
      }),
    ).rejects.toThrow(
      "Saved question query aggregations cannot use Measures or Metrics, which belong to a table source.",
    );

    await expect(
      // @ts-expect-error Metrics belong to a table source
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [TEST_SCHEMA.metrics.questionRevenue],
      }),
    ).rejects.toThrow(
      "Saved question query aggregations cannot use Measures or Metrics, which belong to a table source.",
    );
  });

  it("rejects saved question orderBys that skip the query's grouping", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [avg(TEST_SCHEMA.questions.ordersQuestion.columns[1])],
        breakouts: [TEST_SCHEMA.questions.ordersQuestion.columns[0]],
        orderBys: [
          orderBy(TEST_SCHEMA.questions.ordersQuestion.columns[2], "desc"),
        ],
      }),
    ).rejects.toThrow(
      "Saved question query orderBys for grouped queries must use query breakouts or aggregations included in the query.",
    );
  });

  it("rejects metric sources with a clear error message", async () => {
    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        // @ts-expect-error a metric is not a valid query source
        source: TEST_SCHEMA.metrics.revenue,
      }),
    ).rejects.toThrow(
      'Query object creation requires a source reference like `{ type: "table", id }` or `{ type: "card", id }`.',
    );
  });
});
