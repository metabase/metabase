import type {
  ExpressionDefinitionEntry,
  MetricDefinitionEntry,
  MetricExpressionId,
  MetricSourceId,
  MetricsViewerTabState,
} from "../types/viewer-state";

import { reconcileDimensionMappings } from "./reconcile-dimension-mappings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metric(sourceId: MetricSourceId): MetricDefinitionEntry {
  return { id: sourceId, type: "metric", definition: null as any };
}

function expression(
  name: string,
  tokens: any[] = [],
): ExpressionDefinitionEntry {
  return {
    id: `expression:${name}` as MetricExpressionId,
    type: "expression",
    name,
    tokens,
  };
}

function makeTab(
  overrides: Partial<MetricsViewerTabState> = {},
): MetricsViewerTabState {
  return {
    id: "tab-1",
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
// Tests
// ---------------------------------------------------------------------------

describe("reconcileDimensionMappings", () => {
  it("returns the same tab objects when nothing changed", () => {
    const entities = [metric(REVENUE), metric(ORDERS)];
    const tab = makeTab({
      dimensionMapping: { 0: "created_at", 1: "created_at" },
    });

    const result = reconcileDimensionMappings([tab], entities, entities);

    expect(result[0]).toBe(tab); // referential equality — no change
  });

  it("preserves mappings when entities are identical", () => {
    const old = [metric(REVENUE)];
    const next = [metric(REVENUE)];
    const tab = makeTab({ dimensionMapping: { 0: "created_at" } });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({ 0: "created_at" });
  });

  // ── Removal ─────────────────────────────────────────────────────────────

  it("removes mapping when an entity is removed", () => {
    const old = [metric(REVENUE), metric(ORDERS)];
    const next = [metric(REVENUE)];
    const tab = makeTab({
      dimensionMapping: { 0: "created_at", 1: "order_date" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({ 0: "created_at" });
  });

  it("shifts indices down when a preceding entity is removed", () => {
    const old = [metric(REVENUE), metric(ORDERS), metric(COSTS)];
    const next = [metric(ORDERS), metric(COSTS)]; // Revenue removed
    const tab = makeTab({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord", 2: "dim-cost" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord",
      1: "dim-cost",
    });
  });

  // ── Reorder ─────────────────────────────────────────────────────────────

  it("remaps indices when entities are reordered", () => {
    const old = [metric(REVENUE), metric(ORDERS)];
    const next = [metric(ORDERS), metric(REVENUE)]; // swapped
    const tab = makeTab({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord",
      1: "dim-rev",
    });
  });

  // ── Adding a new instance of an existing metric ─────────────────────────

  it("assigns the same dimension to a new instance of an already-mapped metric", () => {
    const old = [metric(REVENUE)];
    const next = [metric(REVENUE), metric(REVENUE)]; // second instance added
    const tab = makeTab({
      dimensionMapping: { 0: "created_at" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "created_at",
      1: "created_at", // inherited from sibling
    });
  });

  it("assigns sibling dimension to a third instance of the same metric", () => {
    const old = [metric(REVENUE), metric(REVENUE)];
    const next = [metric(REVENUE), metric(REVENUE), metric(REVENUE)];
    const tab = makeTab({
      dimensionMapping: { 0: "created_at", 1: "created_at" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "created_at",
      1: "created_at",
      2: "created_at", // inherited from sibling
    });
  });

  it("inherits dimension when a new metric instance is added alongside different metrics", () => {
    const old = [metric(REVENUE), metric(ORDERS)];
    const next = [metric(REVENUE), metric(ORDERS), metric(REVENUE)]; // second Revenue at end
    const tab = makeTab({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-rev",
      1: "dim-ord",
      2: "dim-rev", // inherited from Revenue sibling at index 0
    });
  });

  // ── Adding a completely new metric ──────────────────────────────────────

  it("does not add mapping for a brand-new metric with no sibling", () => {
    const old = [metric(REVENUE)];
    const next = [metric(REVENUE), metric(ORDERS)]; // Orders is new
    const tab = makeTab({
      dimensionMapping: { 0: "created_at" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    // Orders has no sibling with a mapping, so it stays unmapped
    expect(result[0].dimensionMapping).toEqual({ 0: "created_at" });
  });

  // ── Null dimension ──────────────────────────────────────────────────────

  it("inherits null dimension from sibling", () => {
    const old = [metric(REVENUE)];
    const next = [metric(REVENUE), metric(REVENUE)];
    const tab = makeTab({
      dimensionMapping: { 0: null },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: null,
      1: null,
    });
  });

  // ── Expression token slots ──────────────────────────────────────────────

  it("handles expression tokens as independent slots", () => {
    // Expression "Revenue + Orders" has two metric tokens
    const expr = expression("Revenue + Orders", [
      { type: "metric", sourceId: REVENUE, count: 1 },
      { type: "operator", op: "+" },
      { type: "metric", sourceId: ORDERS, count: 1 },
    ]);
    // old: [Revenue standalone, expr] → slots: 0=Revenue(standalone), 1=Revenue(expr tok 0), 2=Orders(expr tok 2)
    const old = [metric(REVENUE), expr];
    // next: same, plus a second standalone Orders → slots: 0=Revenue, 1=Revenue(tok), 2=Orders(tok), 3=Orders(standalone)
    const next = [metric(REVENUE), expr, metric(ORDERS)];
    const tab = makeTab({
      dimensionMapping: {
        0: "dim-rev", // standalone Revenue slot
        1: "dim-rev", // expression token Revenue slot
        2: "dim-ord", // expression token Orders slot
      },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-rev", // standalone Revenue — unchanged
      1: "dim-rev", // expression token Revenue — unchanged
      2: "dim-ord", // expression token Orders — unchanged
      3: "dim-ord", // new standalone Orders — inherited from sibling (expr token Orders)
    });
  });

  // ── Multiple tabs ──────────────────────────────────────────────────────

  it("reconciles all tabs independently", () => {
    const old = [metric(REVENUE)];
    const next = [metric(REVENUE), metric(REVENUE)];
    const tab1 = makeTab({
      id: "tab-1",
      dimensionMapping: { 0: "created_at" },
    });
    const tab2 = makeTab({
      id: "tab-2",
      dimensionMapping: { 0: "category" },
    });

    const result = reconcileDimensionMappings([tab1, tab2], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "created_at",
      1: "created_at",
    });
    expect(result[1].dimensionMapping).toEqual({
      0: "category",
      1: "category",
    });
  });

  // ── Empty cases ─────────────────────────────────────────────────────────

  it("handles empty old entities (all entities are new)", () => {
    const old: MetricDefinitionEntry[] = [];
    const next = [metric(REVENUE)];
    const tab = makeTab({ dimensionMapping: {} });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({});
  });

  it("handles empty new entities (all entities removed)", () => {
    const old = [metric(REVENUE)];
    const next: MetricDefinitionEntry[] = [];
    const tab = makeTab({ dimensionMapping: { 0: "created_at" } });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({});
  });

  it("handles empty tabs array", () => {
    const result = reconcileDimensionMappings(
      [],
      [metric(REVENUE)],
      [metric(ORDERS)],
    );

    expect(result).toEqual([]);
  });

  // ── Complex scenario ───────────────────────────────────────────────────

  it("handles simultaneous add, remove, and reorder", () => {
    // Old: [Revenue, Orders, Costs]
    // New: [Orders, Revenue, Revenue]  — Costs removed, Revenue duplicated, swapped
    const old = [metric(REVENUE), metric(ORDERS), metric(COSTS)];
    const next = [metric(ORDERS), metric(REVENUE), metric(REVENUE)];
    const tab = makeTab({
      dimensionMapping: { 0: "dim-rev", 1: "dim-ord", 2: "dim-cost" },
    });

    const result = reconcileDimensionMappings([tab], old, next);

    expect(result[0].dimensionMapping).toEqual({
      0: "dim-ord", // Orders moved from index 1 → 0
      1: "dim-rev", // Revenue moved from index 0 → 1
      2: "dim-rev", // New Revenue instance inherits from sibling
    });
  });
});
