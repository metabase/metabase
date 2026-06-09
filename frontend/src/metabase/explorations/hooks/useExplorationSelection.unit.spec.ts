import { act } from "@testing-library/react";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type {
  DimensionId,
  ExplorationMetric,
  MetricDimension,
  Timeline,
} from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
  createMockTimeline,
} from "metabase-types/api/mocks";

import {
  type DimensionBlock,
  isMetricBlock,
  useExplorationSelection,
} from "./useExplorationSelection";

function makeDim(id: string, interestingness: number | null): MetricDimension {
  return createMockMetricDimension({
    id,
    display_name: id,
    dimension_interestingness: interestingness,
  });
}

function makeMetric(
  id: number,
  dimensionIds: DimensionId[],
): ExplorationMetric {
  return createMockMetric({
    id,
    name: `Metric ${id}`,
    dimension_ids: dimensionIds,
  }) as ExplorationMetric;
}

function makeDimensionsById(
  dims: MetricDimension[],
): Map<DimensionId, MetricDimension> {
  return new Map(dims.map((d) => [d.id, d]));
}

function renderSelection(timelines: Timeline[] = []) {
  setupTimelinesEndpoints(timelines);
  return renderHookWithProviders(() => useExplorationSelection(), {});
}

function metricBlockOf(result: {
  current: ReturnType<typeof useExplorationSelection>;
}) {
  const block = result.current.blocks[0];
  if (!block || !isMetricBlock(block)) {
    throw new Error("expected a metric block");
  }
  return block;
}

describe("useExplorationSelection", () => {
  describe("addMetric", () => {
    it("keeps every referenced dimension as a candidate but selects only the interesting ones", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const dimLow = makeDim("dim-low", 0.3);
      const metric = makeMetric(1, ["dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimHigh, dimLow]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      const block = metricBlockOf(result);
      expect(block.dimensions.map((d) => d.id)).toEqual([
        "dim-high",
        "dim-low",
      ]);
      expect([...block.selectedDimensionIds]).toEqual(["dim-high"]);
    });

    it("selects all referenced dimensions when none are interesting", () => {
      const dimA = makeDim("dim-a", 0.2);
      const dimB = makeDim("dim-b", null);
      const metric = makeMetric(1, ["dim-a", "dim-b"]);
      const dimensionsById = makeDimensionsById([dimA, dimB]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect([...metricBlockOf(result).selectedDimensionIds].sort()).toEqual([
        "dim-a",
        "dim-b",
      ]);
    });

    it("orders the candidate dimensions by interestingness descending", () => {
      const dimMid = makeDim("dim-mid", 0.85);
      const dimHigh = makeDim("dim-high", 0.98);
      const dimLow = makeDim("dim-low", 0.82);
      const metric = makeMetric(1, ["dim-mid", "dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimMid, dimHigh, dimLow]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect(metricBlockOf(result).dimensions.map((d) => d.id)).toEqual([
        "dim-high",
        "dim-mid",
        "dim-low",
      ]);
    });

    it("is a no-op when the metric block already exists", () => {
      const dim = makeDim("dim-a", 0.9);
      const metric = makeMetric(1, ["dim-a"]);
      const dimensionsById = makeDimensionsById([dim]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      const blocksAfterFirst = result.current.blocks;

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect(result.current.blocks).toBe(blocksAfterFirst);
    });
  });

  describe("toggleDimensionSelected", () => {
    it("flips a candidate dimension's selected state within a metric block", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const dimLow = makeDim("dim-low", 0.3);
      const metric = makeMetric(1, ["dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimHigh, dimLow]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      const blockId = result.current.blocks[0].id;

      act(() => {
        result.current.toggleDimensionSelected(blockId, "dim-low");
      });
      expect([...metricBlockOf(result).selectedDimensionIds].sort()).toEqual([
        "dim-high",
        "dim-low",
      ]);

      act(() => {
        result.current.toggleDimensionSelected(blockId, "dim-high");
      });
      expect([...metricBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-low",
      ]);
    });
  });

  describe("addDimension", () => {
    it("adds a dimension block, all related metrics selected, and is idempotent", () => {
      const dimA = makeDim("dim-a", 0.9);
      const metric1 = makeMetric(1, ["dim-a"]);
      const metric2 = makeMetric(2, ["dim-a"]);
      const metricsByDimension = new Map([["dim-a", [metric1, metric2]]]);

      const { result } = renderSelection();

      act(() => {
        result.current.addDimension(dimA, {
          group: null,
          metricsByDimension,
        });
      });

      const block = result.current.blocks[0];
      if (block.kind !== "dimension") {
        throw new Error("expected a dimension block");
      }
      expect(block.metrics.map((m) => m.id)).toEqual([1, 2]);
      expect([...block.selectedMetricIds].sort()).toEqual([1, 2]);

      const blocksAfterFirst = result.current.blocks;
      act(() => {
        result.current.addDimension(dimA, {
          group: null,
          metricsByDimension,
        });
      });
      expect(result.current.blocks).toBe(blocksAfterFirst);
    });
  });

  describe("toggleMetricSelected", () => {
    it("flips a candidate metric's selected state within a dimension block", () => {
      const dimA = makeDim("dim-a", 0.9);
      const metric1 = makeMetric(1, ["dim-a"]);
      const metric2 = makeMetric(2, ["dim-a"]);

      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([
          {
            kind: "dimension",
            id: "dim:dim-a",
            dimension: dimA,
            groupDimensions: [dimA],
            metrics: [metric1, metric2],
            selectedMetricIds: new Set([1, 2]),
          },
        ]);
      });

      act(() => {
        result.current.toggleMetricSelected("dim:dim-a", 1);
      });

      expect([
        ...(result.current.blocks[0] as DimensionBlock).selectedMetricIds,
      ]).toEqual([2]);
    });
  });

  describe("addTimelinesById", () => {
    it("adds timelines resolved from allTimelines", async () => {
      const timeline1 = createMockTimeline({ id: 1, name: "Product launches" });
      const timeline2 = createMockTimeline({ id: 2, name: "Marketing" });

      const { result } = renderSelection([timeline1, timeline2]);

      await waitFor(() => {
        expect(result.current.allTimelines).toHaveLength(2);
      });

      act(() => {
        result.current.addTimelinesById([1, 2]);
      });

      expect(result.current.timelines.map((t) => t.id)).toEqual([1, 2]);
    });

    it("ignores unknown ids and already-selected timelines", async () => {
      const timeline1 = createMockTimeline({ id: 1, name: "Product launches" });
      const timeline2 = createMockTimeline({ id: 2, name: "Marketing" });

      const { result } = renderSelection([timeline1, timeline2]);

      await waitFor(() => {
        expect(result.current.allTimelines).toHaveLength(2);
      });

      act(() => {
        result.current.toggleTimeline(timeline1);
      });
      act(() => {
        result.current.addTimelinesById([1, 2, 999]);
      });

      expect(result.current.timelines.map((t) => t.id)).toEqual([1, 2]);
    });

    it("is a no-op when every id is unknown or already selected", async () => {
      const timeline1 = createMockTimeline({ id: 1, name: "Product launches" });

      const { result } = renderSelection([timeline1]);

      await waitFor(() => {
        expect(result.current.allTimelines).toHaveLength(1);
      });

      act(() => {
        result.current.toggleTimeline(timeline1);
      });
      const timelinesAfterFirst = result.current.timelines;

      act(() => {
        result.current.addTimelinesById([1, 999]);
      });

      expect(result.current.timelines).toBe(timelinesAfterFirst);
    });
  });
});
