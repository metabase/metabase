import type {
  MetricDefinitionEntry,
  MetricSourceId,
  MetricsViewerDimensionBreakoutState,
} from "../types";

import { remapDimensionMappings } from "./remap-dimension-mappings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metric(sourceId: MetricSourceId): MetricDefinitionEntry {
  return { id: sourceId, type: "metric", definition: null as any };
}

function makeDimensionBreakout(
  overrides: Partial<MetricsViewerDimensionBreakoutState> = {},
): MetricsViewerDimensionBreakoutState {
  return {
    id: "dimensionBreakout-1",
    type: "time",
    label: "By Month",
    display: "line",
    dimensionMapping: {},
    projectionConfig: {},
    ...overrides,
  };
}

const REVENUE: MetricSourceId = "metric:1" as MetricSourceId;
const ORDERS: MetricSourceId = "metric:2" as MetricSourceId;
const COSTS: MetricSourceId = "metric:3" as MetricSourceId;

// ---------------------------------------------------------------------------
// remapDimensionMappings — fast path using precomputed slot mapping
// ---------------------------------------------------------------------------

describe("remapDimensionMappings", () => {
  it("returns same dimensionBreakout objects when slot mapping is identity", () => {
    const entities = [metric(REVENUE), metric(ORDERS)];
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "created_at", 1: "created_at" },
    });
    const slotMapping = new Map([
      [0, 0],
      [1, 1],
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      entities,
    );

    expect(result[0]).toBe(dimensionBreakout); // referential equality
  });

  it("remaps indices when slots shift", () => {
    // Old: [Revenue(0), Orders(1), Costs(2)], New: [Orders(0), Costs(1)]
    // Revenue removed, Orders 1→0, Costs 2→1
    const next = [metric(ORDERS), metric(COSTS)];
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord", 2: "dim-cost" },
    });
    const slotMapping = new Map([
      [1, 0], // Orders: old 1 → new 0
      [2, 1], // Costs:  old 2 → new 1
      // Revenue (old 0) not in map — removed
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord",
      1: "dim-cost",
    });
  });

  it("remaps indices when entities are reordered", () => {
    const next = [metric(ORDERS), metric(REVENUE)]; // swapped
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord" },
    });
    const slotMapping = new Map([
      [0, 1], // Revenue: old 0 → new 1
      [1, 0], // Orders:  old 1 → new 0
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord",
      1: "dim-rev",
    });
  });

  it("inherits sibling dimension for a new slot with same sourceId", () => {
    const next = [metric(REVENUE), metric(REVENUE)]; // second instance added
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "created_at" },
    });
    const slotMapping = new Map([
      [0, 0], // original Revenue stays at 0
      // slot 1 is new — not in the mapping
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({
      0: "created_at",
      1: "created_at", // inherited from sibling
    });
  });

  it("does not add mapping for a brand-new metric with no sibling", () => {
    const next = [metric(REVENUE), metric(ORDERS)]; // Orders is new
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "created_at" },
    });
    const slotMapping = new Map([
      [0, 0], // Revenue stays
      // slot 1 (Orders) is new with no sibling
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({ 0: "created_at" });
  });

  it("reconciles multiple dimensionBreakouts independently", () => {
    const next = [metric(ORDERS), metric(REVENUE)]; // swapped
    const dimensionBreakout1 = makeDimensionBreakout({
      id: "dimensionBreakout-1",
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord" },
    });
    const dimensionBreakout2 = makeDimensionBreakout({
      id: "dimensionBreakout-2",
      dimensionMapping: { 0: "cat-rev", 1: "cat-ord" },
    });
    const slotMapping = new Map([
      [0, 1],
      [1, 0],
    ]);

    const result = remapDimensionMappings(
      [dimensionBreakout1, dimensionBreakout2],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord",
      1: "dim-rev",
    });
    expect(result[1].dimensionMapping).toEqual({
      0: "cat-ord",
      1: "cat-rev",
    });
  });

  it("handles empty slot mapping (all entities new)", () => {
    const next = [metric(REVENUE)];
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: "created_at" },
    });
    const slotMapping = new Map<number, number>();

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({});
  });

  it("inherits null dimension from sibling", () => {
    const next = [metric(REVENUE), metric(REVENUE)];
    const dimensionBreakout = makeDimensionBreakout({
      dimensionMapping: { 0: null },
    });
    const slotMapping = new Map([[0, 0]]);

    const result = remapDimensionMappings(
      [dimensionBreakout],
      slotMapping,
      next,
    );

    expect(result[0].dimensionMapping).toEqual({
      0: null,
      1: null,
    });
  });
});
