import { createMockField, createMockTable } from "metabase-types/api/mocks";

import type { ScdTypeInference } from "./history-source";
import {
  HISTORY_SHAPES,
  getChangeShape,
  getHistoryShape,
  getScdTypeForChangeShape,
  getScdTypeForHistoryShape,
  inferCurrentTable,
  inferCurrentValueFields,
  inferFactKeyFields,
  inferPreviousValuePairs,
  resolveCurrentTableScdType,
  resolveHistoryScdType,
} from "./scd-types";

const field = (id: number, name: string, table_id = 1) =>
  createMockField({ id, name, display_name: name, table_id });

const BASE_INFERENCE: ScdTypeInference = {
  scdType: 2,
  rule: "explicit-interval",
  signal: "valid_from / valid_to pair",
  confidence: "high",
};

const inferredSource = {
  scdType: 2 as const,
  scdTypeInference: BASE_INFERENCE,
  isScdTypeOverridden: false,
};

describe("inferPreviousValuePairs", () => {
  it("pairs previous and prior columns with the column they shadow", () => {
    const region = field(1, "region");
    const previousRegion = field(2, "previous_region");
    const segment = field(3, "segment");
    const segmentPrior = field(4, "segment_prior");

    expect(
      inferPreviousValuePairs([region, previousRegion, segment, segmentPrior]),
    ).toEqual([
      { field: region, previousField: previousRegion },
      { field: segment, previousField: segmentPrior },
    ]);
  });

  it("ignores a previous column without its current column", () => {
    expect(inferPreviousValuePairs([field(1, "previous_region")])).toEqual([]);
  });
});

describe("inferCurrentValueFields", () => {
  it("finds current_ columns next to the column they mirror", () => {
    const plan = field(1, "plan");
    const currentPlan = field(2, "current_plan");

    expect(inferCurrentValueFields([plan, currentPlan])).toEqual([currentPlan]);
  });

  it("doesn't treat a current flag as a current-value column", () => {
    expect(inferCurrentValueFields([field(1, "is_current")])).toEqual([]);
  });
});

describe("inferCurrentTable", () => {
  const history = createMockTable({
    id: 1,
    name: "subscription_history",
    schema: "analytics",
  });

  it("finds the current table a history table is named after", () => {
    const subscriptions = createMockTable({
      id: 2,
      name: "subscriptions",
      schema: "analytics",
    });

    expect(inferCurrentTable(history, [history, subscriptions])).toBe(
      subscriptions,
    );
  });

  it("only looks in the same schema", () => {
    const subscriptions = createMockTable({
      id: 2,
      name: "subscription",
      schema: "raw",
    });

    expect(inferCurrentTable(history, [subscriptions])).toBeUndefined();
  });

  it("needs a history-style name", () => {
    const dimCustomer = createMockTable({
      id: 1,
      name: "dim_customer",
      schema: "analytics",
    });
    const customer = createMockTable({
      id: 2,
      name: "customer",
      schema: "analytics",
    });

    expect(inferCurrentTable(dimCustomer, [customer])).toBeUndefined();
  });
});

describe("inferFactKeyFields", () => {
  const dimension = createMockTable({ id: 1, name: "dim_customer" });
  const durableKey = field(10, "customer_id", 1);

  it("finds fact columns that link to the durable key or share its name", () => {
    const linked = field(20, "buyer_id", 2);
    const named = field(30, "customer_id", 3);
    const orders = createMockTable({
      id: 2,
      name: "orders",
      fields: [{ ...linked, fk_target_field_id: 10 }],
    });
    const payments = createMockTable({
      id: 3,
      name: "fct_payments",
      fields: [named],
    });
    const notes = createMockTable({
      id: 4,
      name: "notes",
      fields: [field(40, "customer_id", 4)],
    });

    expect(
      inferFactKeyFields(dimension, durableKey, [
        dimension,
        orders,
        payments,
        notes,
      ]).map(({ table, field }) => [table.name, field.name]),
    ).toEqual([
      ["orders", "buyer_id"],
      ["fct_payments", "customer_id"],
    ]);
  });

  it("finds nothing without a durable key", () => {
    expect(inferFactKeyFields(dimension, undefined, [dimension])).toEqual([]);
  });
});

describe("resolveHistoryScdType", () => {
  const currentTable = createMockTable({ id: 2, name: "subscriptions" });

  it("prefers current-value columns over a current table", () => {
    expect(
      resolveHistoryScdType(inferredSource, {
        currentValueFields: [field(1, "current_plan")],
        currentTable,
      }).scdType,
    ).toBe(6);
  });

  it("uses a current table when there are no current-value columns", () => {
    expect(
      resolveHistoryScdType(inferredSource, {
        currentValueFields: [],
        currentTable,
      }).scdType,
    ).toBe(4);
  });

  it("falls back to how the history was recognized", () => {
    expect(
      resolveHistoryScdType(inferredSource, {
        currentValueFields: [],
        currentTable: undefined,
      }),
    ).toMatchObject({ scdType: 2, signal: BASE_INFERENCE.signal });
  });

  it("keeps the type an admin set", () => {
    expect(
      resolveHistoryScdType(
        { ...inferredSource, scdType: 7, isScdTypeOverridden: true },
        { currentValueFields: [field(1, "current_plan")], currentTable },
      ),
    ).toMatchObject({ scdType: 7, isOverridden: true });
  });
});

describe("resolveCurrentTableScdType", () => {
  const source = { scdType: null, isScdTypeOverridden: false };

  it("is type 3 with previous-value columns", () => {
    const pairs = inferPreviousValuePairs([
      field(1, "region"),
      field(2, "previous_region"),
    ]);

    expect(resolveCurrentTableScdType(source, pairs).scdType).toBe(3);
  });

  it("is type 1 otherwise", () => {
    expect(resolveCurrentTableScdType(source, []).scdType).toBe(1);
  });
});

describe("getHistoryShape", () => {
  it("tells the two plain history tables apart by their valid to", () => {
    expect(getHistoryShape(2, true)).toBe("versions-with-dates");
    expect(getHistoryShape(2, false)).toBe("latest-row-per-key");
  });

  it("round-trips every shape through its stored type", () => {
    HISTORY_SHAPES.forEach((shape) => {
      expect(
        getHistoryShape(
          getScdTypeForHistoryShape(shape),
          shape === "versions-with-dates",
        ),
      ).toBe(shape);
    });
  });
});

describe("getChangeShape", () => {
  it("round-trips through the stored type", () => {
    expect(getChangeShape(getScdTypeForChangeShape("previous-value"))).toBe(
      "previous-value",
    );
    expect(getChangeShape(getScdTypeForChangeShape("overwritten"))).toBe(
      "overwritten",
    );
  });
});
