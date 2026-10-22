import { act } from "@testing-library/react";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { Api } from "metabase/api";
import { getUserPersonalCollectionId } from "metabase/current-user";
import { useSelector } from "metabase/redux";
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

function firstBlockOf(result: {
  current: ReturnType<typeof useExplorationSelection>;
}) {
  const block = result.current.blocks[0];
  if (!block) {
    throw new Error("expected a block");
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

      const block = firstBlockOf(result);
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

      expect([...firstBlockOf(result).selectedDimensionIds].sort()).toEqual([
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

      expect(firstBlockOf(result).dimensions.map((d) => d.id)).toEqual([
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
      expect([...firstBlockOf(result).selectedDimensionIds]).toEqual([
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
      expect([...firstBlockOf(result).selectedDimensionIds].sort()).toEqual([
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
      expect([...firstBlockOf(result).selectedDimensionIds]).toEqual([
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
    it("flips a candidate dimension's selected state", () => {
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
      expect([...firstBlockOf(result).selectedDimensionIds].sort()).toEqual([
        "dim-high",
        "dim-low",
      ]);

      act(() => {
        result.current.toggleDimensionSelected(blockId, "dim-high");
      });
      expect([...firstBlockOf(result).selectedDimensionIds]).toEqual([
        "dim-low",
      ]);
    });
  });

  describe("removeBlockDimensions", () => {
    function blockWith(dims: MetricDimension[], selected: DimensionId[]) {
      return {
        id: metricBlockId(1),
        metric: makeMetric(
          1,
          dims.map((d) => d.id),
        ),
        dimensions: dims,
        selectedDimensionIds: new Set(selected),
      };
    }

    it("deselects a dimension, keeping the block", () => {
      const dimA = makeDim("dim-a", 0.9);
      const dimB = makeDim("dim-b", 0.8);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([blockWith([dimA, dimB], ["dim-a", "dim-b"])]);
      });
      act(() => {
        result.current.removeBlockDimensions(metricBlockId(1), ["dim-a"]);
      });

      expect([...firstBlockOf(result).selectedDimensionIds]).toEqual(["dim-b"]);
    });

    it("drops the block when its last selected dimension is removed", () => {
      const dimA = makeDim("dim-a", 0.9);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([blockWith([dimA], ["dim-a"])]);
      });
      act(() => {
        result.current.removeBlockDimensions(metricBlockId(1), ["dim-a"]);
      });

      expect(result.current.blocks).toHaveLength(0);
    });

    it("is a no-op when none of the given dimensions are selected", () => {
      const dimA = makeDim("dim-a", 0.9);
      const dimB = makeDim("dim-b", 0.8);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([blockWith([dimA, dimB], ["dim-a", "dim-b"])]);
      });
      const blocksBefore = result.current.blocks;
      act(() => {
        result.current.removeBlockDimensions(metricBlockId(1), ["dim-missing"]);
      });

      expect(result.current.blocks).toBe(blocksBefore);
    });

    it("is a no-op when the block id is not present", () => {
      const dimA = makeDim("dim-a", 0.9);
      const { result } = renderSelection();

      act(() => {
        result.current.setBlocks([blockWith([dimA], ["dim-a"])]);
      });
      act(() => {
        result.current.removeBlockDimensions("metric:999", ["dim-a"]);
      });

      expect(result.current.blocks).toHaveLength(1);
      expect([...firstBlockOf(result).selectedDimensionIds]).toEqual(["dim-a"]);
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
    // Renders the personal-collection selector alongside the hook: the store
    // notification for an upserted user lands on a later tick, so tests wait
    // on this probe to know the hook has actually seen the user.
    function renderSelectionWithoutUser() {
      setupTimelinesEndpoints([]);
      return renderHookWithProviders(
        () => ({
          selection: useExplorationSelection(),
          personalCollectionId: useSelector(getUserPersonalCollectionId),
        }),
        { storeInitialState: { currentUser: null } },
      );
    }

    function upsertUser(store: { dispatch: (action: unknown) => unknown }) {
      const entries = [
        {
          endpointName: "getCurrentUser",
          arg: undefined,
          value: createMockUser({ personal_collection_id: 42 }),
        },
      ];
      act(() => {
        store.dispatch(
          Api.util.upsertQueryEntries(
            // RTK validates endpointName/value at runtime against the injected
            // endpoint registry; TS can't pick the right union branch here (same
            // cast as `seedApiQueryCache` in __support__/state/api.ts).
            entries as unknown as Parameters<
              typeof Api.util.upsertQueryEntries
            >[0],
          ),
        );
      });
    }

    it("applies the personal-collection default when the user resolves after the first render", async () => {
      const { result, store } = renderSelectionWithoutUser();

      expect(result.current.selection.collection.id).toBeUndefined();

      upsertUser(store);

      await waitFor(() => {
        expect(result.current.selection.collection.id).toBe(42);
      });
    });

    it("does not clobber an explicit collection selection with the default", async () => {
      const { result, store } = renderSelectionWithoutUser();

      act(() => {
        result.current.selection.setCollection({
          id: 7,
          name: "Our analytics",
        });
      });
      upsertUser(store);

      await waitFor(() => {
        expect(result.current.personalCollectionId).toBe(42);
      });

      expect(result.current.selection.collection).toEqual({
        id: 7,
        name: "Our analytics",
      });
    });
  });
});
