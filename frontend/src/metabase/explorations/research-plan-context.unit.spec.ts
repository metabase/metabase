import type {
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase-types/api";
import { createMockMetric } from "metabase-types/api/mocks/metric";
import { createMockTimeline } from "metabase-types/api/mocks/timeline";

import { selectionToResearchPlanContext } from "./research-plan-context";
import { mockDimensionBlock, mockMetricBlock } from "./test-utils";

function metric(id: number, name: string): ExplorationMetric {
  // Unjustified type cast. FIXME
  return createMockMetric({ id, name }) as ExplorationMetric;
}

function dimension(
  id: string,
  opts?: Partial<MetricDimension>,
): MetricDimension {
  return {
    id,
    name: id,
    display_name: id,
    effective_type: "type/Text",
    semantic_type: null,
    ...opts,
  };
}

describe("selectionToResearchPlanContext", () => {
  it("serializes a metric block as a metric-anchored group with only selected dimensions", () => {
    const region = dimension("d1", { display_name: "Region" });
    const plan = dimension("d2", { display_name: "Plan" });
    const block = mockMetricBlock(
      metric(42, "Revenue"),
      [region, plan],
      new Set(["d1"]), // only Region selected
    );

    const result = selectionToResearchPlanContext({
      blocks: [block],
      timelines: [],
      name: "Why was revenue down?",
    });

    expect(result.name).toBe("Why was revenue down?");
    expect(result.groups).toEqual([
      {
        block_id: "metric:42",
        anchor: "metric",
        metric: { id: 42, name: "Revenue" },
        dimensions: [{ id: "d1", name: "Region" }],
      },
    ]);
  });

  it("serializes a dimension block as a dimension-anchored group with only selected metrics", () => {
    const planDim = dimension("d7", { display_name: "Plan" });
    const block = mockDimensionBlock(
      planDim,
      [metric(42, "Revenue"), metric(43, "Churn")],
      [planDim],
      new Set([42]), // only Revenue selected
    );

    const result = selectionToResearchPlanContext({
      blocks: [block],
      timelines: [],
      name: "",
    });

    expect(result.groups).toEqual([
      {
        block_id: "dim:d7",
        anchor: "dimension",
        dimension: { id: "d7", name: "Plan" },
        metrics: [{ id: 42, name: "Revenue" }],
      },
    ]);
  });

  it("includes selected timelines", () => {
    const timelines: Timeline[] = [
      createMockTimeline({ id: 1, name: "Releases" }),
      createMockTimeline({ id: 2, name: "Campaigns" }),
    ];

    const result = selectionToResearchPlanContext({
      blocks: [],
      timelines,
      name: "",
    });

    expect(result.timelines).toEqual([
      { id: 1, name: "Releases" },
      { id: 2, name: "Campaigns" },
    ]);
  });

  it("falls back to the dimension name when display_name is empty", () => {
    const dim = dimension("d9", { name: "raw_name", display_name: "" });
    const block = mockMetricBlock(metric(1, "M"), [dim], new Set(["d9"]));

    const result = selectionToResearchPlanContext({
      blocks: [block],
      timelines: [],
      name: "",
    });

    expect(result.groups[0]).toMatchObject({
      dimensions: [{ id: "d9", name: "raw_name" }],
    });
  });

  it("produces an empty plan for an empty selection", () => {
    expect(
      selectionToResearchPlanContext({ blocks: [], timelines: [], name: "" }),
    ).toEqual({ name: "", groups: [], timelines: [] });
  });
});
