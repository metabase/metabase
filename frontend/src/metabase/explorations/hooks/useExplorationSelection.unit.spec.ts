import { act } from "@testing-library/react";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { refreshCurrentUser } from "metabase/redux/user";
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
  createMockUser,
} from "metabase-types/api/mocks";

import {
  type DimensionBlock,
  isMetricBlock,
  metricBlockId,
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
  // Unjustified type cast. FIXME
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

    it("grows an existing block by selecting the explicitly-requested dimensions", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const dimLow = makeDim("dim-low", 0.3);
      const metric = makeMetric(1, ["dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimHigh, dimLow]);

      const { result } = renderSelection();

      // First add selects only the interesting dimension.
      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      expect([...metricBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-high",
      ]);

      // Re-adding with an explicit extra dimension grows the existing block's selection.
      act(() => {
        result.current.addMetric(metric, {
          dimensionsById,
          additionalSelectedDimensionIds: new Set(["dim-low"]),
        });
      });

      expect(result.current.blocks).toHaveLength(1);
      expect([...metricBlockOf(result).selectedDimensionIds].sort()).toEqual([
        "dim-high",
        "dim-low",
      ]);
    });

    it("replaces the interesting defaults with exactly the requested dimensions when replace is set", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const dimLow = makeDim("dim-low", 0.1);
      const metric = makeMetric(1, ["dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimHigh, dimLow]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, {
          dimensionsById,
          additionalSelectedDimensionIds: new Set(["dim-low"]),
          replace: true,
        });
      });

      // Without replace this would select dim-high (interesting) ∪ dim-low; with replace it is
      // exactly the requested dim-low.
      expect([...metricBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-low",
      ]);
    });

    it("is a no-op when the requested dimensions are already selected", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const metric = makeMetric(1, ["dim-high"]);
      const dimensionsById = makeDimensionsById([dimHigh]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      const blocksAfterFirst = result.current.blocks;

      act(() => {
        result.current.addMetric(metric, {
          dimensionsById,
          additionalSelectedDimensionIds: new Set(["dim-high"]),
        });
      });

      expect(result.current.blocks).toBe(blocksAfterFirst);
    });
  });

  describe("removeBlock", () => {
    it("removes the block with the matching id", () => {
      const dim = makeDim("dim-a", 0.9);
      const metric = makeMetric(1, ["dim-a"]);
      const dimensionsById = makeDimensionsById([dim]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      expect(result.current.blocks).toHaveLength(1);

      act(() => {
        result.current.removeBlock(metricBlockId(1));
      });

      expect(result.current.blocks).toHaveLength(0);
    });

    it("is a no-op when no block has the given id", () => {
      const dim = makeDim("dim-a", 0.9);
      const metric = makeMetric(1, ["dim-a"]);
      const dimensionsById = makeDimensionsById([dim]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      const blocksBefore = result.current.blocks;

      act(() => {
        result.current.removeBlock("metric:999");
      });

      // Removing an id that isn't present leaves every block in place.
      expect(result.current.blocks).toEqual(blocksBefore);
      expect(result.current.blocks).toHaveLength(1);
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

    it("selects only the requested metrics when a subset is given", () => {
      const dimA = makeDim("dim-a", 0.9);
      const metric1 = makeMetric(1, ["dim-a"]);
      const metric2 = makeMetric(2, ["dim-a"]);
      const metricsByDimension = new Map([["dim-a", [metric1, metric2]]]);

      const { result } = renderSelection();

      act(() => {
        result.current.addDimension(dimA, {
          group: null,
          metricsByDimension,
          selectedMetricIds: new Set([1]),
        });
      });

      const block = result.current.blocks[0];
      if (block.kind !== "dimension") {
        throw new Error("expected a dimension block");
      }
      // Both metrics remain candidates, but only the requested one is selected.
      expect(block.metrics.map((m) => m.id).sort()).toEqual([1, 2]);
      expect([...block.selectedMetricIds]).toEqual([1]);
    });

    it("grows an existing dimension block by re-selecting related metrics", () => {
      const dimA = makeDim("dim-a", 0.9);
      const metric1 = makeMetric(1, ["dim-a"]);
      const metric2 = makeMetric(2, ["dim-a"]);
      const metricsByDimension = new Map([["dim-a", [metric1, metric2]]]);

      const { result } = renderSelection();

      // Existing block with metric 2 deselected.
      act(() => {
        result.current.setBlocks([
          {
            kind: "dimension",
            id: "dim:dim-a",
            dimension: dimA,
            groupDimensions: [dimA],
            metrics: [metric1, metric2],
            selectedMetricIds: new Set([1]),
          },
        ]);
      });

      act(() => {
        result.current.addDimension(dimA, {
          group: null,
          metricsByDimension,
        });
      });

      expect(result.current.blocks).toHaveLength(1);
      expect(
        [
          // Unjustified type cast. FIXME
          ...(result.current.blocks[0] as DimensionBlock).selectedMetricIds,
        ].sort(),
      ).toEqual([1, 2]);
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
        // Unjustified type cast. FIXME
        ...(result.current.blocks[0] as DimensionBlock).selectedMetricIds,
      ]).toEqual([2]);
    });
  });

  describe("removeBlockMembers", () => {
    function metricBlockWith(dims: MetricDimension[], selected: DimensionId[]) {
      return {
        kind: "metric" as const,
        id: metricBlockId(1),
        metric: makeMetric(
          1,
          dims.map((d) => d.id),
        ),
        dimensions: dims,
        selectedDimensionIds: new Set(selected),
      };
    }

    function dimensionBlockWith(
      metrics: ExplorationMetric[],
      selected: number[],
    ) {
      const dimA = makeDim("dim-a", 0.9);
      return {
        kind: "dimension" as const,
        id: "dim:dim-a",
        dimension: dimA,
        groupDimensions: [dimA],
        metrics,
        selectedMetricIds: new Set(selected),
      };
    }

    it("deselects a dimension within a metric block, keeping the block", () => {
      const dimA = makeDim("dim-a", 0.9);
      const dimB = makeDim("dim-b", 0.8);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([
          metricBlockWith([dimA, dimB], ["dim-a", "dim-b"]),
        ]);
      });
      act(() => {
        result.current.removeBlockMembers(metricBlockId(1), {
          dimensionIds: ["dim-a"],
        });
      });

      expect([...metricBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-b",
      ]);
    });

    it("drops the metric block when its last selected dimension is removed", () => {
      const dimA = makeDim("dim-a", 0.9);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([metricBlockWith([dimA], ["dim-a"])]);
      });
      act(() => {
        result.current.removeBlockMembers(metricBlockId(1), {
          dimensionIds: ["dim-a"],
        });
      });

      expect(result.current.blocks).toHaveLength(0);
    });

    it("deselects a metric within a dimension block, keeping the block", () => {
      const metric1 = makeMetric(1, ["dim-a"]);
      const metric2 = makeMetric(2, ["dim-a"]);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([
          dimensionBlockWith([metric1, metric2], [1, 2]),
        ]);
      });
      act(() => {
        result.current.removeBlockMembers("dim:dim-a", { metricIds: [1] });
      });

      expect([
        // Unjustified type cast. FIXME
        ...(result.current.blocks[0] as DimensionBlock).selectedMetricIds,
      ]).toEqual([2]);
    });

    it("drops the dimension block when its last selected metric is removed", () => {
      const metric1 = makeMetric(1, ["dim-a"]);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([dimensionBlockWith([metric1], [1])]);
      });
      act(() => {
        result.current.removeBlockMembers("dim:dim-a", { metricIds: [1] });
      });

      expect(result.current.blocks).toHaveLength(0);
    });

    it("ignores a mismatched member family", () => {
      const dimA = makeDim("dim-a", 0.9);
      const dimB = makeDim("dim-b", 0.8);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([
          metricBlockWith([dimA, dimB], ["dim-a", "dim-b"]),
        ]);
      });
      // metric ids don't apply to a metric block — nothing changes
      act(() => {
        result.current.removeBlockMembers(metricBlockId(1), {
          metricIds: [1, 2],
        });
      });

      expect([...metricBlockOf(result).selectedDimensionIds].sort()).toEqual([
        "dim-a",
        "dim-b",
      ]);
    });

    it("is a no-op when the block id is not present", () => {
      const dimA = makeDim("dim-a", 0.9);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([metricBlockWith([dimA], ["dim-a"])]);
      });
      act(() => {
        result.current.removeBlockMembers("metric:999", {
          dimensionIds: ["dim-a"],
        });
      });

      expect(result.current.blocks).toHaveLength(1);
      expect([...metricBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-a",
      ]);
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
        result.current.addTimelinesById([1]);
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
        result.current.addTimelinesById([1]);
      });
      const timelinesAfterFirst = result.current.timelines;

      act(() => {
        result.current.addTimelinesById([1, 999]);
      });

      expect(result.current.timelines).toBe(timelinesAfterFirst);
    });
  });

  describe("removeTimelinesById", () => {
    it("removes the selected timelines with matching ids", async () => {
      const timeline1 = createMockTimeline({ id: 1, name: "Product launches" });
      const timeline2 = createMockTimeline({ id: 2, name: "Marketing" });

      const { result } = renderSelection([timeline1, timeline2]);

      await waitFor(() => {
        expect(result.current.allTimelines).toHaveLength(2);
      });

      act(() => {
        result.current.addTimelinesById([1, 2]);
      });
      act(() => {
        result.current.removeTimelinesById([1]);
      });

      expect(result.current.timelines.map((t) => t.id)).toEqual([2]);
    });

    it("is a no-op when no selected timeline has the given id", async () => {
      const timeline1 = createMockTimeline({ id: 1, name: "Product launches" });

      const { result } = renderSelection([timeline1]);

      await waitFor(() => {
        expect(result.current.allTimelines).toHaveLength(1);
      });

      act(() => {
        result.current.addTimelinesById([1]);
      });
      const timelinesAfterAdd = result.current.timelines;

      act(() => {
        result.current.removeTimelinesById([999]);
      });

      expect(result.current.timelines).toBe(timelinesAfterAdd);
    });
  });

  describe("collection default", () => {
    function renderSelectionWithoutUser() {
      setupTimelinesEndpoints([]);
      return renderHookWithProviders(() => useExplorationSelection(), {
        storeInitialState: { currentUser: null },
      });
    }

    it("applies the personal-collection default when the user resolves after the first render", () => {
      const { result, store } = renderSelectionWithoutUser();

      expect(result.current.collection.id).toBeUndefined();

      act(() => {
        store.dispatch(
          refreshCurrentUser.fulfilled(
            createMockUser({ personal_collection_id: 42 }),
            "requestId",
          ),
        );
      });

      expect(result.current.collection.id).toBe(42);
    });

    it("does not clobber an explicit collection selection with the default", () => {
      const { result, store } = renderSelectionWithoutUser();

      act(() => {
        result.current.setCollection({ id: 7, name: "Our analytics" });
      });
      act(() => {
        store.dispatch(
          refreshCurrentUser.fulfilled(
            createMockUser({ personal_collection_id: 42 }),
            "requestId",
          ),
        );
      });

      expect(result.current.collection).toEqual({
        id: 7,
        name: "Our analytics",
      });
    });
  });
});
