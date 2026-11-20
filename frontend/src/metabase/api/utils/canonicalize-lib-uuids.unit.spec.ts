import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { MetricDatasetRequest, TestQuerySpec } from "metabase-types/api";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { canonicalizeLibUuids } from "./canonicalize-lib-uuids";

function createMetricRequest(
  sourceUuid: string,
  projectionUuid: string,
  projectionSourceUuid = sourceUuid,
): MetricDatasetRequest {
  return {
    definition: {
      expression: ["metric", { "lib/uuid": sourceUuid }, 42],
      projections: [
        {
          type: "metric",
          id: 42,
          "lib/uuid": projectionSourceUuid,
          projection: [
            [
              "dimension",
              { "lib/uuid": projectionUuid, "temporal-unit": "month" },
              "created-at",
            ],
          ],
        },
      ],
    },
  };
}

const TWO_AGGREGATIONS: TestQuerySpec["stages"][number]["aggregations"] = [
  { type: "operator", operator: "count", args: [] },
  {
    type: "operator",
    operator: "sum",
    args: [{ type: "column", name: "TOTAL" }],
  },
];

function createOrderedQuery(orderByIndex: number) {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: TWO_AGGREGATIONS,
      },
    ],
  });
  const column = Lib.orderableColumns(query, 0)[orderByIndex];

  return Lib.toJsQuery(Lib.orderBy(query, 0, column));
}

describe("canonicalizeLibUuids", () => {
  it("gives equivalent metric definitions with regenerated UUIDs the same value", () => {
    expect(canonicalizeLibUuids(createMetricRequest("a", "b"))).toEqual(
      canonicalizeLibUuids(createMetricRequest("c", "d")),
    );
  });

  it("preserves UUID relationships that identify source instances", () => {
    expect(
      canonicalizeLibUuids(createMetricRequest("a", "b", "other-source")),
    ).not.toEqual(canonicalizeLibUuids(createMetricRequest("a", "b")));
  });

  it("gives a rebuilt query the same value", () => {
    const first = createOrderedQuery(0);
    const second = createOrderedQuery(0);

    expect(first).not.toEqual(second);
    expect(canonicalizeLibUuids(first)).toEqual(canonicalizeLibUuids(second));
  });

  it("tells apart queries whose references point at different clauses", () => {
    expect(canonicalizeLibUuids(createOrderedQuery(0))).not.toEqual(
      canonicalizeLibUuids(createOrderedQuery(1)),
    );
  });

  it("does not depend on key order", () => {
    expect(
      canonicalizeLibUuids({
        first: { "lib/uuid": "a" },
        second: { "lib/uuid": "b" },
      }),
    ).toEqual(
      canonicalizeLibUuids({
        second: { "lib/uuid": "d" },
        first: { "lib/uuid": "c" },
      }),
    );
  });

  it("leaves the args unchanged and returns one value per args object", () => {
    const request = createMetricRequest("a", "b");
    const snapshot = structuredClone(request);
    const canonical = canonicalizeLibUuids(request);

    expect(request).toEqual(snapshot);
    expect(canonicalizeLibUuids(request)).toBe(canonical);
  });

  it("keeps args without UUIDs as they are", () => {
    const request = { type: "internal", fn: "audit", args: [] };

    expect(canonicalizeLibUuids(request)).toEqual(request);
  });
});
