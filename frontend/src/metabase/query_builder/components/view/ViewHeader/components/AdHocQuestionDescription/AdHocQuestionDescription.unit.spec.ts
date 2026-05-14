import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import { ORDERS_ID, PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { describeQueryStage } from "./utils";

describe("describeQueryStage", () => {
  it("can strip temporal bucket suffixes from breakout names", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "CREATED_AT",
              sourceName: "ORDERS",
              unit: "month",
            },
          ],
        },
      ],
    });

    // Temporal buckets are included by default
    expect(describeQueryStage(query, 0)).toBe("Count by Created At: Month");

    // When stripTemporalBucket is true, the ": Month" suffix is then removed
    expect(describeQueryStage(query, 0, { stripTemporalBucket: true })).toBe(
      "Count by Created At",
    );
  });

  it("preserves non-temporal breakout suffixes when stripping temporal buckets", () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: PRODUCTS_ID },
          aggregations: [{ type: "operator", operator: "count", args: [] }],
          breakouts: [
            {
              type: "column",
              name: "RATING",
              sourceName: "PRODUCTS",
              bins: 10,
            },
          ],
        },
      ],
    });

    expect(describeQueryStage(query, 0)).toBe("Count by Rating: 10 bins");

    expect(describeQueryStage(query, 0, { stripTemporalBucket: true })).toBe(
      "Count by Rating: 10 bins",
    );
  });
});
