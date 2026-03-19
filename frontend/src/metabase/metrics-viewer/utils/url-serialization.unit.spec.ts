import type { DimensionFilterValue } from "./dimension-filters";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  deserializeFormulaEntities,
  encodeState,
} from "./url-serialization";

function encodeStateOrThrow(state: SerializedMetricsViewerPageState): string {
  const result = encodeState(state);
  if (result === undefined) {
    throw new Error("encodeState returned undefined unexpectedly");
  }
  return result;
}

describe("url-serialization", () => {
  describe("encodeState / decodeState round-trip", () => {
    it("round-trips a state with sources and tabs", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          { type: "metric", id: 1, breakout: "dim-1" },
          { type: "measure", id: 42 },
        ],
        tabs: [
          {
            id: "tab-1",
            type: "time",
            label: "By Month",
            display: "bar",
            definitions: [
              { definitionId: "metric:1", dimensionId: "created_at" },
            ],
            projectionConfig: {
              temporalUnit: "month",
            },
          },
        ],
        selectedTabId: "tab-1",
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a source with breakoutTemporalUnit", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          {
            type: "metric",
            id: 1,
            breakout: "created_at",
            breakoutTemporalUnit: "year",
          },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a source with breakoutBinning", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          {
            type: "metric",
            id: 2,
            breakout: "total",
            breakoutBinning: "50 bins",
          },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a source with both breakoutTemporalUnit and breakoutBinning", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          {
            type: "metric",
            id: 3,
            breakout: "dim-1",
            breakoutTemporalUnit: "quarter",
            breakoutBinning: "Auto bin",
          },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an empty state", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips sources with filters", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
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
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips a non-empty expressions list", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          { type: "metric", id: 1 },
          { type: "metric", id: 2 },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [
          {
            id: "expression:Revenue + Costs",
            name: "Revenue + Costs",
            tokens: [
              { type: "metric", sourceId: "metric:1" },
              { type: "operator", op: "+" },
              { type: "metric", sourceId: "metric:2" },
            ],
          },
        ],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an expression with parentheses", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          { type: "metric", id: 1 },
          { type: "metric", id: 2 },
          { type: "metric", id: 3 },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [
          {
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
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });
  });

  describe("decodeState with empty/invalid input", () => {
    it("returns empty state for empty string", () => {
      expect(decodeState("")).toEqual({
        sources: [],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      });
    });

    it("returns empty state for invalid base64", () => {
      expect(decodeState("!!!not-valid-base64!!!")).toEqual({
        sources: [],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      });
    });

    it("returns empty state for valid base64 but invalid JSON", () => {
      const hash = btoa("not json");
      expect(decodeState(hash)).toEqual({
        sources: [],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      });
    });

    it("never returns null", () => {
      const result = decodeState("");
      expect(result).not.toBeNull();
      expect(result).toBeDefined();
    });
  });

  describe("Unicode round-trip", () => {
    it("survives non-ASCII metric labels in tabs", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [{ type: "metric", id: 1 }],
        tabs: [
          {
            id: "tab-1",
            type: "time",
            label: "Ré\u00e9venues par mois \u2014 \u00e9t\u00e9",
            display: "line",
            definitions: [],
          },
        ],
        selectedTabId: "tab-1",
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives CJK characters", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [{ type: "metric", id: 1 }],
        tabs: [
          {
            id: "tab-1",
            type: "category",
            label: "\u6708\u5225\u58f2\u4e0a",
            display: "bar",
            definitions: [],
          },
        ],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives emoji characters", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [{ type: "metric", id: 1 }],
        tabs: [
          {
            id: "tab-1",
            type: "time",
            label: "\ud83d\udcc8 Revenue",
            display: "line",
            definitions: [],
          },
        ],
        selectedTabId: null,
        expressions: [],
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });
  });

  describe("Date filter revival through encode/decode", () => {
    function roundTripFilter(filter: DimensionFilterValue) {
      const state: SerializedMetricsViewerPageState = {
        sources: [
          {
            type: "metric",
            id: 1,
            filters: [{ dimensionId: "created_at", value: filter }],
          },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };
      return decodeState(encodeStateOrThrow(state)).sources[0].filters![0]
        .value;
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
  });

  describe("BigInt filter revival through encode/decode", () => {
    it("revives BigInt values in number filters after encode/decode", () => {
      const filter: DimensionFilterValue = {
        type: "number",
        operator: "=",
        values: [BigInt("9007199254740993"), BigInt("-9007199254740993")],
      };
      const state: SerializedMetricsViewerPageState = {
        sources: [
          {
            type: "metric",
            id: 1,
            filters: [{ dimensionId: "price", value: filter }],
          },
        ],
        tabs: [],
        selectedTabId: null,
        expressions: [],
      };

      const decoded = decodeState(encodeStateOrThrow(state));
      expect(decoded.sources[0].filters![0].value).toEqual(filter);
    });
  });

  describe("decodeState returns independent objects", () => {
    it("returns distinct objects for separate calls", () => {
      const first = decodeState("");
      const second = decodeState("");
      expect(first).not.toBe(second);
      expect(first.sources).not.toBe(second.sources);
      expect(first.tabs).not.toBe(second.tabs);
    });
  });

  describe("deserializeFormulaEntities", () => {
    function emptyState(
      overrides: Partial<SerializedMetricsViewerPageState> = {},
    ): SerializedMetricsViewerPageState {
      return {
        sources: [],
        tabs: [],
        selectedTabId: null,
        expressions: [],
        ...overrides,
      };
    }

    it("returns empty array for empty state", () => {
      expect(deserializeFormulaEntities(emptyState())).toEqual([]);
    });

    it("returns metric entities for sources", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          sources: [
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
          sources: [
            { type: "metric", id: 1 },
            { type: "metric", id: 2 },
          ],
          expressions: [
            {
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
            { type: "metric", sourceId: "metric:1" },
            { type: "operator", op: "+" },
            { type: "metric", sourceId: "metric:2" },
          ],
        },
      ]);
    });

    it("deserializes parentheses", () => {
      const result = deserializeFormulaEntities(
        emptyState({
          expressions: [
            {
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
          expressions: [
            {
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
          expressions: [
            {
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
  });
});
