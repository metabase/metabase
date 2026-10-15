import type { MetricDatasetRequest } from "metabase-types/api";

import { getMetricDatasetCacheKey } from "./get-metric-dataset-cache-key";

function createRequest(
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

describe("getMetricDatasetCacheKey", () => {
  it("uses the same cache key for equivalent definitions with regenerated UUIDs", () => {
    expect(getMetricDatasetCacheKey(createRequest("a", "b"))).toBe(
      getMetricDatasetCacheKey(createRequest("c", "d")),
    );
  });

  it("preserves UUID relationships that identify source instances", () => {
    expect(
      getMetricDatasetCacheKey(createRequest("a", "b", "other-source")),
    ).not.toBe(getMetricDatasetCacheKey(createRequest("a", "b")));
  });
});
