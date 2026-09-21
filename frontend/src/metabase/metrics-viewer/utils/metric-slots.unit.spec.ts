import type { MetricsViewerFormulaEntity } from "metabase/metrics-viewer/types";

import { computeMetricSlots } from "./metric-slots";

describe("computeMetricSlots", () => {
  it("preserves expression metric occurrence counts", () => {
    const formulaEntities: MetricsViewerFormulaEntity[] = [
      {
        id: "expression:repeated-revenue",
        type: "expression",
        name: "Repeated Revenue",
        tokens: [
          { type: "metric", sourceId: "metric:1", occurrenceCount: 1 },
          { type: "operator", op: "+" },
          { type: "metric", sourceId: "metric:1", occurrenceCount: 2 },
        ],
      },
    ];

    expect(computeMetricSlots(formulaEntities)).toEqual([
      {
        slotIndex: 0,
        entityIndex: 0,
        sourceId: "metric:1",
        tokenPosition: 0,
        occurrenceCount: 1,
      },
      {
        slotIndex: 1,
        entityIndex: 0,
        sourceId: "metric:1",
        tokenPosition: 2,
        occurrenceCount: 2,
      },
    ]);
  });
});
