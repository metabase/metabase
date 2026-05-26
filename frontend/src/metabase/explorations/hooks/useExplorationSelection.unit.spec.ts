import { act } from "@testing-library/react";

import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import type { ExplorationMetric } from "metabase/explorations/types";
import type {
  DimensionId,
  MetricDimension,
  Timeline,
} from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
  createMockTimeline,
} from "metabase-types/api/mocks";

import { useExplorationSelection } from "./useExplorationSelection";

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

describe("useExplorationSelection", () => {
  describe("addMetric", () => {
    it("adds only interesting dimensions when at least one exists", () => {
      const dimHigh = makeDim("dim-high", 0.9);
      const dimLow = makeDim("dim-low", 0.3);
      const metric = makeMetric(1, ["dim-high", "dim-low"]);
      const dimensionsById = makeDimensionsById([dimHigh, dimLow]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect(result.current.metrics).toEqual([
        expect.objectContaining({ id: 1 }),
      ]);
      expect(result.current.dimensions.map((d) => d.id)).toEqual(["dim-high"]);
    });

    it("falls back to all referenced dimensions when none are interesting", () => {
      const dimA = makeDim("dim-a", 0.2);
      const dimB = makeDim("dim-b", null);
      const metric = makeMetric(1, ["dim-a", "dim-b"]);
      const dimensionsById = makeDimensionsById([dimA, dimB]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect(result.current.dimensions.map((d) => d.id)).toEqual([
        "dim-a",
        "dim-b",
      ]);
    });

    it("is a no-op when the metric is already selected", () => {
      const dim = makeDim("dim-a", 0.9);
      const metric = makeMetric(1, ["dim-a"]);
      const dimensionsById = makeDimensionsById([dim]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });
      const metricsAfterFirst = result.current.metrics;
      const dimensionsAfterFirst = result.current.dimensions;

      act(() => {
        result.current.addMetric(metric, { dimensionsById });
      });

      expect(result.current.metrics).toBe(metricsAfterFirst);
      expect(result.current.dimensions).toBe(dimensionsAfterFirst);
    });
  });

  describe("toggleMetric", () => {
    it("adds the metric when not selected (delegates to addMetric logic)", () => {
      const dim = makeDim("dim-a", 0.9);
      const metric = makeMetric(1, ["dim-a"]);
      const dimensionsById = makeDimensionsById([dim]);

      const { result } = renderSelection();

      act(() => {
        result.current.toggleMetric(metric, { dimensionsById });
      });

      expect(result.current.metrics).toEqual([
        expect.objectContaining({ id: 1 }),
      ]);
      expect(result.current.dimensions.map((d) => d.id)).toEqual(["dim-a"]);
    });

    it("removes the metric and its orphaned dimensions when already selected", () => {
      const dimA = makeDim("dim-a", 0.9);
      const dimShared = makeDim("dim-shared", 0.8);
      const dimB = makeDim("dim-b", 0.8);
      const metric1 = makeMetric(1, ["dim-a", "dim-shared"]);
      const metric2 = makeMetric(2, ["dim-b", "dim-shared"]);
      const dimensionsById = makeDimensionsById([dimA, dimShared, dimB]);

      const { result } = renderSelection();

      act(() => {
        result.current.addMetric(metric1, { dimensionsById });
        result.current.addMetric(metric2, { dimensionsById });
      });

      expect(result.current.metrics).toHaveLength(2);

      act(() => {
        result.current.toggleMetric(metric1, { dimensionsById });
      });

      expect(result.current.metrics.map((m) => m.id)).toEqual([2]);
      // dim-a is orphaned (only metric1 used it), dim-shared survives
      expect(result.current.dimensions.map((d) => d.id).sort()).toEqual(
        ["dim-b", "dim-shared"].sort(),
      );
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
      expect(result.current.timelines[0]).toEqual(timeline1);
      expect(result.current.timelines[1]).toEqual(timeline2);
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
      expect(result.current.timelines[0]).toEqual(timeline1);
      expect(result.current.timelines[1]).toEqual(timeline2);
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
