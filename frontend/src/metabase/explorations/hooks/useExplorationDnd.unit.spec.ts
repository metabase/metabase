import type { DragEndEvent } from "@dnd-kit/core";
import { renderHook } from "@testing-library/react";

import {
  makeMockSelection,
  mockDimensionBlock,
  mockMetricBlock,
} from "../test-utils";
import type { ExplorationMetric } from "../types";

import {
  RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
  RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
  isExplorationDropAccepted,
  isNewBlockDroppableId,
  paletteDimensionDragId,
  paletteMetricDragId,
  useExplorationDnd,
} from "./useExplorationDnd";
import type { ExplorationSelection } from "./useExplorationSelection";

const dimPlan = {
  id: "accounts.plan",
  display_name: "Plan",
  effective_type: "type/Text",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 2 }],
  dimension_interestingness: 0.9,
} as any;

const revenueMetric = {
  id: 1,
  name: "Revenue",
  dimension_ids: ["orders.created_at"],
} as unknown as ExplorationMetric;

const churnMetric = {
  id: 2,
  name: "Churn",
  dimension_ids: ["accounts.plan"],
} as unknown as ExplorationMetric;

function makeDragEvent(
  activeId: string,
  data: any,
  overId: string | null,
): DragEndEvent {
  return {
    active: { id: activeId, data: { current: data } },
    over: overId == null ? null : { id: overId, data: { current: {} } },
    delta: { x: 0, y: 0 },
    activatorEvent: new MouseEvent("mousedown"),
    collisions: null,
  } as unknown as DragEndEvent;
}

function setupDnd(selection: ExplorationSelection) {
  return renderHook(() => useExplorationDnd(selection)).result.current;
}

describe("useExplorationDnd", () => {
  describe("isExplorationDropAccepted", () => {
    it("accepts cross-kind drops only", () => {
      expect(isExplorationDropAccepted("metric", "dimension")).toBe(true);
      expect(isExplorationDropAccepted("dimension", "metric")).toBe(true);
      expect(isExplorationDropAccepted("metric", "metric")).toBe(false);
      expect(isExplorationDropAccepted("dimension", "dimension")).toBe(false);
    });
  });

  describe("handleDragEnd", () => {
    it("routes a dimension drag onto a metric block to addDimensionToMetricBlock", () => {
      const selection = makeMockSelection({
        blocks: [mockMetricBlock(revenueMetric, [])],
      });
      const { handleDragEnd } = setupDnd(selection);

      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          {
            kind: "dimension",
            payload: dimPlan,
            context: { group: null, metricsByDimension: new Map() },
          },
          "metric:1",
        ),
      );

      expect(selection.addDimensionToMetricBlock).toHaveBeenCalledWith(
        "metric:1",
        dimPlan,
      );
      expect(selection.addMetricToDimensionBlock).not.toHaveBeenCalled();
    });

    it("routes a metric drag onto a dimension block to addMetricToDimensionBlock", () => {
      const selection = makeMockSelection({
        blocks: [mockDimensionBlock(dimPlan, [])],
      });
      const { handleDragEnd } = setupDnd(selection);

      handleDragEnd(
        makeDragEvent(
          paletteMetricDragId(churnMetric.id),
          {
            kind: "metric",
            payload: churnMetric,
            context: { dimensionsById: new Map() },
          },
          "dim:accounts.plan",
        ),
      );

      expect(selection.addMetricToDimensionBlock).toHaveBeenCalledWith(
        "dim:accounts.plan",
        churnMetric,
      );
      expect(selection.addDimensionToMetricBlock).not.toHaveBeenCalled();
    });

    it("ignores same-kind drops (dimension over dimension block)", () => {
      const selection = makeMockSelection({
        blocks: [mockDimensionBlock(dimPlan, [])],
      });
      const { handleDragEnd } = setupDnd(selection);

      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          {
            kind: "dimension",
            payload: dimPlan,
            context: { group: null, metricsByDimension: new Map() },
          },
          "dim:accounts.plan",
        ),
      );

      expect(selection.addDimensionToMetricBlock).not.toHaveBeenCalled();
      expect(selection.addMetricToDimensionBlock).not.toHaveBeenCalled();
    });

    it("ignores same-kind drops (metric over metric block)", () => {
      const selection = makeMockSelection({
        blocks: [mockMetricBlock(revenueMetric, [])],
      });
      const { handleDragEnd } = setupDnd(selection);

      handleDragEnd(
        makeDragEvent(
          paletteMetricDragId(revenueMetric.id),
          {
            kind: "metric",
            payload: revenueMetric,
            context: { dimensionsById: new Map() },
          },
          "metric:1",
        ),
      );

      expect(selection.addDimensionToMetricBlock).not.toHaveBeenCalled();
      expect(selection.addMetricToDimensionBlock).not.toHaveBeenCalled();
    });

    it("ignores drops outside any known block", () => {
      const selection = makeMockSelection({
        blocks: [mockMetricBlock(revenueMetric, [])],
      });
      const { handleDragEnd } = setupDnd(selection);

      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          {
            kind: "dimension",
            payload: dimPlan,
            context: { group: null, metricsByDimension: new Map() },
          },
          null,
        ),
      );
      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          {
            kind: "dimension",
            payload: dimPlan,
            context: { group: null, metricsByDimension: new Map() },
          },
          "metric:999",
        ),
      );

      expect(selection.addDimensionToMetricBlock).not.toHaveBeenCalled();
      expect(selection.addMetricToDimensionBlock).not.toHaveBeenCalled();
    });

    it("routes a metric drag onto the empty-state target to selection.addMetric with the drag's context", () => {
      const selection = makeMockSelection({ blocks: [] });
      const { handleDragEnd } = setupDnd(selection);
      const context = { dimensionsById: new Map() };

      handleDragEnd(
        makeDragEvent(
          paletteMetricDragId(revenueMetric.id),
          { kind: "metric", payload: revenueMetric, context },
          RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
        ),
      );

      expect(selection.addMetric).toHaveBeenCalledWith(revenueMetric, context);
      expect(selection.toggleDimension).not.toHaveBeenCalled();
    });

    it("routes a dimension drag onto the empty-state target to selection.toggleDimension with the drag's context", () => {
      const selection = makeMockSelection({ blocks: [] });
      const { handleDragEnd } = setupDnd(selection);
      const context = { group: null, metricsByDimension: new Map() };

      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          { kind: "dimension", payload: dimPlan, context },
          RESEARCH_PLAN_EMPTY_DROPPABLE_ID,
        ),
      );

      expect(selection.toggleDimension).toHaveBeenCalledWith(dimPlan, context);
      expect(selection.addMetric).not.toHaveBeenCalled();
    });

    it("routes a metric drag onto the trailing new-block target to selection.addMetric", () => {
      // Even with existing blocks, dropping on the trailing
      // "create new area" target produces a brand new block — same
      // routing as the empty-state target.
      const selection = makeMockSelection({
        blocks: [mockMetricBlock(revenueMetric, [])],
      });
      const { handleDragEnd } = setupDnd(selection);
      const context = { dimensionsById: new Map() };

      handleDragEnd(
        makeDragEvent(
          paletteMetricDragId(churnMetric.id),
          { kind: "metric", payload: churnMetric, context },
          RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
        ),
      );

      expect(selection.addMetric).toHaveBeenCalledWith(churnMetric, context);
      expect(selection.toggleDimension).not.toHaveBeenCalled();
    });

    it("routes a dimension drag onto the trailing new-block target to selection.toggleDimension", () => {
      const selection = makeMockSelection({
        blocks: [mockMetricBlock(revenueMetric, [])],
      });
      const { handleDragEnd } = setupDnd(selection);
      const context = { group: null, metricsByDimension: new Map() };

      handleDragEnd(
        makeDragEvent(
          paletteDimensionDragId(dimPlan.id),
          { kind: "dimension", payload: dimPlan, context },
          RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID,
        ),
      );

      expect(selection.toggleDimension).toHaveBeenCalledWith(dimPlan, context);
      expect(selection.addMetric).not.toHaveBeenCalled();
    });
  });

  describe("isNewBlockDroppableId", () => {
    it("recognizes both the empty-state and trailing drop targets", () => {
      expect(isNewBlockDroppableId(RESEARCH_PLAN_EMPTY_DROPPABLE_ID)).toBe(
        true,
      );
      expect(isNewBlockDroppableId(RESEARCH_PLAN_NEW_BLOCK_DROPPABLE_ID)).toBe(
        true,
      );
      expect(isNewBlockDroppableId("metric:1")).toBe(false);
      expect(isNewBlockDroppableId("dim:foo")).toBe(false);
      expect(isNewBlockDroppableId(42)).toBe(false);
    });
  });
});
