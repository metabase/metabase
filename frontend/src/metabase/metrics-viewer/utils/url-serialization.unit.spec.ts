import type {
  MetricsViewerDimensionBreakoutState,
  MetricsViewerPageState,
} from "../types";

import type { DimensionFilterValue } from "./dimension-filters";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  deserializeFormulaEntities,
  encodeState,
  stateToSerializedState,
} from "./url-serialization";

function encodeStateOrThrow(state: SerializedMetricsViewerPageState): string {
  const result = encodeState(state);
  if (result === undefined) {
    throw new Error("encodeState returned undefined unexpectedly");
  }
  return result;
}

function createBreakout(
  overrides: Partial<MetricsViewerDimensionBreakoutState> = {},
): MetricsViewerDimensionBreakoutState {
  return {
    id: "time",
    type: "time",
    label: "Time",
    display: "line",
    dimensionMapping: { 0: "created_at" },
    projectionConfig: {},
    ...overrides,
  };
}

function createPageState(
  overrides: Partial<MetricsViewerPageState> = {},
): MetricsViewerPageState {
  return {
    definitions: {},
    formulaEntities: [],
    dimensionBreakouts: [],
    selectedDimensionBreakoutId: null,
    showColumnLabels: false,
    ...overrides,
  };
}

describe("url-serialization", () => {
  describe("encodeState / decodeState round-trip", () => {
    it("round-trips a state with formula entities and dimensionBreakouts", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          { type: "metric", id: 1, breakout: "dim-1" },
          { type: "measure", id: 42 },
        ],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-1",
            type: "time",
            label: "By Month",
            display: "bar",
            definitions: [{ slotIndex: 0, dimensionId: "created_at" }],
            projectionConfig: {
              temporalUnit: "month",
            },
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-1",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips enabled column labels", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
        showColumnLabels: true,
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-1",
            type: "time",
            label: "By Month",
            display: "line",
            definitions: [{ slotIndex: 0, dimensionId: "created_at" }],
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-1",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a metric with breakoutTemporalUnit", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 1,
            breakout: "created_at",
            breakoutTemporalUnit: "year",
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a metric with breakoutBinning", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 2,
            breakout: "total",
            breakoutBinning: "50 bins",
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a metric with both breakoutTemporalUnit and breakoutBinning", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 3,
            breakout: "dim-1",
            breakoutTemporalUnit: "quarter",
            breakoutBinning: "Auto bin",
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an empty state", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips metrics with filters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 5,
            filters: [
              {
                dimensionId: "category",
                value: {
                  type: "string",
                  operator: "=",
                  values: ["Gadget", "Widget"],
                  options: {},
                },
              },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a metric with a single segment", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 5,
            segments: [42],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a metric with multiple segments preserving order", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 5,
            segments: [11, 7, 23],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      const entity = decoded.formulaEntities[0];
      if (entity.type === "expression") {
        throw new Error("Expected metric entity");
      }
      expect(entity.segments).toEqual([11, 7, 23]);
    });

    it("round-trips a metric with both dimension filters and segments", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 5,
            filters: [
              {
                dimensionId: "category",
                value: {
                  type: "string",
                  operator: "=",
                  values: ["Gadget"],
                  options: {},
                },
              },
            ],
            segments: [42],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips expression tokens with segments", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:test",
            name: "test",
            tokens: [
              {
                type: "metric",
                sourceId: "metric:1",
                segments: [99],
              },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:2" },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("decodes a legacy URL without `segments` to undefined (backward compat)", () => {
      // Encode an older-shape state (no segments field) and confirm
      // round-trip still works and leaves segments undefined.
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1, breakout: "dim-1" }],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };
      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      const entity = decoded.formulaEntities[0];
      if (entity.type === "expression") {
        throw new Error("Expected metric entity");
      }
      expect(entity.segments).toBeUndefined();
    });

    it("propagates decoded segments into serializedDefinitionInfo on the entity", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 5, segments: [42] }],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };
      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      const entities = deserializeFormulaEntities(decoded);
      expect(entities).toHaveLength(1);
      const entity = entities[0];
      if (entity.type !== "metric") {
        throw new Error("Expected metric entity");
      }
      expect(entity.serializedDefinitionInfo?.segments).toEqual([42]);
    });

    it("round-trips expressions in formula entities", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          { type: "metric", id: 1 },
          { type: "metric", id: 2 },
          {
            type: "expression",
            id: "expression:Revenue + Costs",
            name: "Revenue + Costs",
            tokens: [
              { type: "metric", sourceId: "metric:1" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:2" },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an expression with parentheses", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          { type: "metric", id: 1 },
          { type: "metric", id: 2 },
          { type: "metric", id: 3 },
          {
            type: "expression",
            id: "expression:(A + B) * C",
            name: "(A + B) * C",
            tokens: [
              { type: "open-paren" },
              { type: "metric", sourceId: "metric:1" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:2" },
              { type: "close-paren" },
              { type: "operator", op: "*" },
              { type: "metric", sourceId: "metric:3" },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips expression tokens with filters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:test",
            name: "test",
            tokens: [
              {
                type: "metric",
                sourceId: "metric:1",
                filters: [
                  {
                    dimensionId: "category",
                    value: {
                      type: "string",
                      operator: "=",
                      values: ["Gadget"],
                      options: {},
                    },
                  },
                ],
              },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:2" },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });
  });

  describe("decodeState with empty/invalid input", () => {
    it("returns empty state for empty string", () => {
      expect(decodeState("")).toEqual({
        formulaEntities: [],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
        showColumnLabels: false,
      });
    });

    it("returns empty state for invalid base64", () => {
      expect(decodeState("!!!not-valid-base64!!!")).toEqual({
        formulaEntities: [],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
        showColumnLabels: false,
      });
    });

    it("returns empty state for valid base64 but invalid JSON", () => {
      const hash = btoa("not json");
      expect(decodeState(hash)).toEqual({
        formulaEntities: [],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
        showColumnLabels: false,
      });
    });

    it("never returns null", () => {
      const result = decodeState("");
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });
  });

  describe("stateToSerializedState", () => {
    it("serializes only the selected dimension breakout", () => {
      const selectedBreakout = createBreakout({
        id: "category",
        type: "category",
        label: "Category",
        display: "bar",
        dimensionMapping: { 0: "category" },
      });
      const state = createPageState({
        dimensionBreakouts: [
          createBreakout({ id: "time" }),
          selectedBreakout,
          createBreakout({ id: "geo", type: "geo", label: "Country" }),
        ],
        selectedDimensionBreakoutId: selectedBreakout.id,
      });

      expect(stateToSerializedState(state)).toEqual({
        formulaEntities: [],
        dimensionBreakouts: [
          {
            id: "category",
            type: "category",
            label: "Category",
            display: "bar",
            definitions: [{ slotIndex: 0, dimensionId: "category" }],
          },
        ],
        selectedDimensionBreakoutId: "category",
      });
    });

    it("preserves the selected dimension breakout configuration", () => {
      const state = createPageState({
        dimensionBreakouts: [
          createBreakout({ id: "inactive" }),
          createBreakout({
            id: "selected",
            label: "Orders by month",
            display: "area",
            dimensionMapping: { 0: "created_at", 1: null },
            projectionConfig: {
              temporalUnit: "month",
              binningStrategy: "10 bins",
              dimensionFilter: {
                type: "string",
                operator: "=",
                values: ["Widget"],
                options: {},
              },
            },
            visualizationSettings: { "graph.show_values": true },
          }),
        ],
        selectedDimensionBreakoutId: "selected",
      });

      expect(stateToSerializedState(state).dimensionBreakouts).toEqual([
        {
          id: "selected",
          type: "time",
          label: "Orders by month",
          display: "area",
          visualizationSettings: { "graph.show_values": true },
          definitions: [
            { slotIndex: 0, dimensionId: "created_at" },
            { slotIndex: 1 },
          ],
          projectionConfig: {
            temporalUnit: "month",
            binning: "10 bins",
            dimensionFilter: {
              type: "string",
              operator: "=",
              values: ["Widget"],
              options: {},
            },
          },
        },
      ]);
    });

    it("serializes no dimension breakouts when none is selected", () => {
      const state = createPageState({
        dimensionBreakouts: [createBreakout({ id: "time" })],
        selectedDimensionBreakoutId: null,
      });

      expect(stateToSerializedState(state)).toMatchObject({
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      });
    });

    it("clears the selected dimension breakout ID when it does not exist", () => {
      const state = createPageState({
        dimensionBreakouts: [createBreakout({ id: "time" })],
        selectedDimensionBreakoutId: "missing",
      });

      expect(stateToSerializedState(state)).toMatchObject({
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      });
    });
  });

  describe("Unicode round-trip", () => {
    it("survives non-ASCII metric labels in dimensionBreakouts", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-1",
            type: "time",
            label: "Ré\u00e9venues par mois \u2014 \u00e9t\u00e9",
            display: "line",
            definitions: [],
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-1",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives CJK characters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-1",
            type: "category",
            label: "\u6708\u5225\u58f2\u4e0a",
            display: "bar",
            definitions: [],
          },
        ],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives emoji characters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-1",
            type: "time",
            label: "\ud83d\udcc8 Revenue",
            display: "line",
            definitions: [],
          },
        ],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });
  });

  describe("Date filter revival through encode/decode", () => {
    function roundTripFilter(filter: DimensionFilterValue) {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 1,
            filters: [{ dimensionId: "created_at", value: filter }],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };
      const decoded = decodeState(encodeStateOrThrow(state));
      const entity = decoded.formulaEntities[0];
      if (entity.type === "expression") {
        throw new Error("Expected metric entity");
      }
      return entity.filters![0].value;
    }

    function roundTripTokenFilter(filter: DimensionFilterValue) {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:test",
            name: "test",
            tokens: [
              {
                type: "metric",
                sourceId: "metric:1",
                filters: [{ dimensionId: "created_at", value: filter }],
              },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };
      const decoded = decodeState(encodeStateOrThrow(state));
      const entity = decoded.formulaEntities[0];
      if (entity.type !== "expression") {
        throw new Error("Expected expression entity");
      }
      const token = entity.tokens[0];
      if (!("filters" in token) || !token.filters) {
        throw new Error("Expected token with filters");
      }
      return token.filters[0].value;
    }

    it("revives specific-date Date values after encode/decode", () => {
      const filter: DimensionFilterValue = {
        type: "specific-date",
        operator: "between",
        values: [
          new Date("2024-01-01T00:00:00Z"),
          new Date("2024-12-31T23:59:59Z"),
        ],
        hasTime: false,
      };

      expect(roundTripFilter(filter)).toEqual(filter);
    });

    it("revives time Date values after encode/decode", () => {
      const filter: DimensionFilterValue = {
        type: "time",
        operator: ">",
        values: [new Date("2024-06-15T10:30:00Z")],
      };

      expect(roundTripFilter(filter)).toEqual(filter);
    });

    it("passes through string filter unchanged", () => {
      const filter: DimensionFilterValue = {
        type: "string",
        operator: "=",
        values: ["Gadget"],
        options: {},
      };

      expect(roundTripFilter(filter)).toEqual(filter);
    });

    it("passes through relative-date filter unchanged", () => {
      const filter: DimensionFilterValue = {
        type: "relative-date",
        unit: "day",
        value: -30,
        offsetUnit: null,
        offsetValue: null,
        options: {},
      };

      expect(roundTripFilter(filter)).toEqual(filter);
    });

    it("revives specific-date Date values on expression token filters", () => {
      const filter: DimensionFilterValue = {
        type: "specific-date",
        operator: "between",
        values: [
          new Date("2024-01-01T00:00:00Z"),
          new Date("2024-12-31T23:59:59Z"),
        ],
        hasTime: false,
      };

      expect(roundTripTokenFilter(filter)).toEqual(filter);
    });

    it("revives time Date values on expression token filters", () => {
      const filter: DimensionFilterValue = {
        type: "time",
        operator: ">",
        values: [new Date("2024-06-15T10:30:00Z")],
      };

      expect(roundTripTokenFilter(filter)).toEqual(filter);
    });
  });

  describe("BigInt filter revival through encode/decode", () => {
    it("revives BigInt values in number filters after encode/decode", () => {
      const filter: DimensionFilterValue = {
        type: "number",
        operator: "=",
        values: [BigInt("9007199254740993"), BigInt("-9007199254740993")],
      };
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 1,
            filters: [{ dimensionId: "price", value: filter }],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const decoded = decodeState(encodeStateOrThrow(state));
      const entity = decoded.formulaEntities[0];
      if (entity.type === "expression") {
        throw new Error("Expected metric entity");
      }
      expect(entity.filters![0].value).toEqual(filter);
    });
  });

  describe("expression with duplicate metrics and different breakouts", () => {
    it("round-trips an expression where the same metric appears twice with different dimension mappings", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:Revenue + Revenue",
            name: "Revenue + Revenue",
            tokens: [
              { type: "metric", sourceId: "metric:1" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:1" },
            ],
          },
        ],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-time",
            type: "time",
            label: "By Time",
            display: "line",
            definitions: [
              { slotIndex: 0, dimensionId: "created_at" },
              { slotIndex: 1, dimensionId: "updated_at" },
            ],
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-time",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an expression where the same metric appears twice with different filters on each token", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:Revenue filtered",
            name: "Revenue filtered",
            tokens: [
              {
                type: "metric",
                sourceId: "metric:1",
                filters: [
                  {
                    dimensionId: "category",
                    value: {
                      type: "string",
                      operator: "=",
                      values: ["Gadget"],
                      options: {},
                    },
                  },
                ],
              },
              { type: "operator", op: "-" },
              {
                type: "metric",
                sourceId: "metric:1",
                filters: [
                  {
                    dimensionId: "category",
                    value: {
                      type: "string",
                      operator: "=",
                      values: ["Widget"],
                      options: {},
                    },
                  },
                ],
              },
            ],
          },
        ],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("preserves per-slot dimension mappings when same metric has different breakouts across multiple dimensionBreakouts", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "expression",
            id: "expression:A + A",
            name: "A + A",
            tokens: [
              { type: "metric", sourceId: "metric:5" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:5" },
            ],
          },
        ],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-time",
            type: "time",
            label: "By Time",
            display: "line",
            definitions: [
              { slotIndex: 0, dimensionId: "created_at" },
              { slotIndex: 1, dimensionId: "shipped_at" },
            ],
          },
          {
            id: "dimensionBreakout-cat",
            type: "category",
            label: "By Category",
            display: "bar",
            definitions: [
              { slotIndex: 0, dimensionId: "product_category" },
              { slotIndex: 1, dimensionId: "user_state" },
            ],
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-cat",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a mix of standalone metric and expression with a duplicate of that metric", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          {
            type: "metric",
            id: 1,
            breakout: "created_at",
            breakoutTemporalUnit: "month",
          },
          {
            type: "expression",
            id: "expression:A + A",
            name: "A + A",
            tokens: [
              { type: "metric", sourceId: "metric:1" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:1" },
            ],
          },
        ],
        dimensionBreakouts: [
          {
            id: "dimensionBreakout-time",
            type: "time",
            label: "By Month",
            display: "line",
            definitions: [
              { slotIndex: 0, dimensionId: "created_at" },
              { slotIndex: 1, dimensionId: "created_at" },
              { slotIndex: 2, dimensionId: "updated_at" },
            ],
          },
        ],
        selectedDimensionBreakoutId: "dimensionBreakout-time",
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });
  });

  describe("decodeState returns independent objects", () => {
    it("returns distinct objects for separate calls", () => {
      const first = decodeState("");
      const second = decodeState("");
      expect(first).not.toBe(second);
      expect(first.formulaEntities).not.toBe(second.formulaEntities);
      expect(first.dimensionBreakouts).not.toBe(second.dimensionBreakouts);
    });
  });

  describe("deserializeFormulaEntities", () => {
    function emptyState(
      overrides: Partial<SerializedMetricsViewerPageState> = {},
    ): SerializedMetricsViewerPageState {
      return {
        formulaEntities: [],
        dimensionBreakouts: [],
        selectedDimensionBreakoutId: null,
        ...overrides,
      };
    }

    it("returns empty array for empty state", () => {
      expect(deserializeFormulaEntities(emptyState())).toEqual([]);
    });

    it("returns metric entities for metric/measure formula entities", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            { type: "metric", id: 1 },
            { type: "measure", id: 42 },
          ],
        }),
      );
      expect(result).toEqual([
        { id: "metric:1", type: "metric", definition: null },
        { id: "measure:42", type: "metric", definition: null },
      ]);
    });

    it("deserializes expression entries with metric tokens", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            { type: "metric", id: 1 },
            { type: "metric", id: 2 },
            {
              type: "expression",
              id: "expression:test",
              name: "test",
              tokens: [
                { type: "metric", sourceId: "metric:1" },
                { type: "operator", op: "+" },
                { type: "metric", sourceId: "metric:2" },
              ],
            },
          ],
        }),
      );
      expect(result).toEqual([
        { id: "metric:1", type: "metric", definition: null },
        { id: "metric:2", type: "metric", definition: null },
        {
          id: "expression:test",
          type: "expression",
          name: "test",
          tokens: [
            { type: "metric", sourceId: "metric:1", occurrenceCount: 1 },
            { type: "operator", op: "+" },
            { type: "metric", sourceId: "metric:2", occurrenceCount: 1 },
          ],
        },
      ]);
    });

    it("deserializes parentheses", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "expression",
              id: "expression:test",
              name: "test",
              tokens: [{ type: "open-paren" }, { type: "close-paren" }],
            },
          ],
        }),
      );
      const expressions = result.filter((e) => e.type === "expression");
      expect(expressions).toHaveLength(1);
      expect(expressions[0]).toMatchObject({
        tokens: [{ type: "open-paren" }, { type: "close-paren" }],
      });
    });

    it("skips metric tokens with missing sourceId", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "expression",
              id: "expression:test",
              name: "test",
              tokens: [{ type: "metric" } as any],
            },
          ],
        }),
      );
      const expressions = result.filter((e) => e.type === "expression");
      expect(expressions[0]).toMatchObject({ tokens: [] });
    });

    it("skips operator tokens with missing op", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "expression",
              id: "expression:test",
              name: "test",
              tokens: [{ type: "operator" } as any],
            },
          ],
        }),
      );
      const expressions = result.filter((e) => e.type === "expression");
      expect(expressions[0]).toMatchObject({ tokens: [] });
    });

    it("preserves formula entity order with expression before metric", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "expression",
              id: "expression:Total",
              name: "Total",
              tokens: [
                { type: "metric", sourceId: "metric:1" },
                { type: "operator", op: "+" },
                { type: "constant", value: 10 },
              ],
            },
            { type: "metric", id: 1 },
          ],
        }),
      );
      expect(result).toEqual([
        {
          id: "expression:Total",
          type: "expression",
          name: "Total",
          tokens: [
            { type: "metric", sourceId: "metric:1", occurrenceCount: 1 },
            { type: "operator", op: "+" },
            { type: "constant", value: 10 },
          ],
        },
        { id: "metric:1", type: "metric", definition: null },
      ]);
    });

    it("preserves formula entity order with metric before expression", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            { type: "metric", id: 1 },
            {
              type: "expression",
              id: "expression:Total",
              name: "Total",
              tokens: [
                { type: "metric", sourceId: "metric:1" },
                { type: "operator", op: "*" },
                { type: "constant", value: 2 },
              ],
            },
          ],
        }),
      );
      expect(result).toEqual([
        { id: "metric:1", type: "metric", definition: null },
        {
          id: "expression:Total",
          type: "expression",
          name: "Total",
          tokens: [
            { type: "metric", sourceId: "metric:1", occurrenceCount: 1 },
            { type: "operator", op: "*" },
            { type: "constant", value: 2 },
          ],
        },
      ]);
    });

    it("populates serializedDefinitionInfo for metrics with breakout", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "metric",
              id: 1,
              breakout: "created_at",
              breakoutTemporalUnit: "month",
            },
          ],
        }),
      );
      expect(result).toEqual([
        {
          id: "metric:1",
          type: "metric",
          definition: null,
          serializedDefinitionInfo: {
            breakout: "created_at",
            breakoutTemporalUnit: "month",
          },
        },
      ]);
    });

    it("populates serializedDefinitionInfo for metrics with filters", () => {
      const filters = [
        {
          dimensionId: "category",
          value: {
            type: "string",
            operator: "=",
            values: ["Gadget"],
            options: {},
          },
        },
      ];
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "metric",
              id: 5,
              filters: filters as any,
            },
          ],
        }),
      );
      expect(result).toEqual([
        {
          id: "metric:5",
          type: "metric",
          definition: null,
          serializedDefinitionInfo: {
            filters,
          },
        },
      ]);
    });

    it("populates serializedDefinitionInfo on expression tokens with filters", () => {
      const tokenFilters = [
        {
          dimensionId: "category",
          value: {
            type: "string",
            operator: "=",
            values: ["Widget"],
            options: {},
          },
        },
      ];
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [
            {
              type: "expression",
              id: "expression:test",
              name: "test",
              tokens: [
                {
                  type: "metric",
                  sourceId: "metric:1",
                  filters: tokenFilters as any,
                },
              ],
            },
          ],
        }),
      );
      const expression = result[0];
      if (expression.type !== "expression") {
        throw new Error("Expected expression entity");
      }
      const metricToken = expression.tokens[0];
      if (metricToken.type !== "metric") {
        throw new Error("Expected metric token");
      }
      expect(metricToken.serializedDefinitionInfo).toEqual({
        filters: tokenFilters,
      });
    });

    it("omits serializedDefinitionInfo for metrics without breakout or filters", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          formulaEntities: [{ type: "metric", id: 1 }],
        }),
      );
      expect(result[0]).toEqual({
        id: "metric:1",
        type: "metric",
        definition: null,
      });
    });
  });
});
