/* eslint-disable import/order */

import { createMockStore, resetTestState } from "./tests/setup";
import { TEST_SCHEMA } from "./tests/fixtures";

import { resolveDatasetQuery as resolveDatasetQueryInBundle } from "embedding-sdk-bundle/lib/create-metabase-query";

import { avg, breakout, filter, orderBy, sum } from ".";

beforeEach(resetTestState);

describe("resolveDatasetQuery validation", () => {
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
      "Saved question queries only support source and enabled, but received fields.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        limit: 10,
      }),
    ).rejects.toThrow(
      "Saved question queries only support source and enabled, but received limit.",
    );

    await expect(
      resolveDatasetQueryInBundle(createMockStore())({
        source: TEST_SCHEMA.questions.ordersQuestion,
        aggregations: [avg(TEST_SCHEMA.questions.ordersQuestion.columns[1])],
      }),
    ).rejects.toThrow(
      "Saved question queries only support source and enabled, but received aggregations.",
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
