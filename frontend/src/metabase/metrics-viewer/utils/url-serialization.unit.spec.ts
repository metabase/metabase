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
    it("round-trips a state with formula entities and tabs", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [
          { type: "metric", id: 1, breakout: "dim-1" },
          { type: "measure", id: 42 },
        ],
        tabs: [
          {
            id: "tab-1",
            type: "time",
            label: "By Month",
            display: "bar",
            definitions: [{ slotIndex: 0, dimensionId: "created_at" }],
            projectionConfig: {
              temporalUnit: "month",
            },
          },
        ],
        selectedTabId: "tab-1",
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an empty state", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [],
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
      });
    });

    it("returns empty state for invalid base64", () => {
      expect(decodeState("!!!not-valid-base64!!!")).toEqual({
        formulaEntities: [],
        tabs: [],
        selectedTabId: null,
      });
    });

    it("returns empty state for valid base64 but invalid JSON", () => {
      const hash = btoa("not json");
      expect(decodeState(hash)).toEqual({
        formulaEntities: [],
        tabs: [],
        selectedTabId: null,
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
        formulaEntities: [{ type: "metric", id: 1 }],
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
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives CJK characters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
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
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("survives emoji characters", () => {
      const state: SerializedMetricsViewerPageState = {
        formulaEntities: [{ type: "metric", id: 1 }],
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [],
        selectedTabId: null,
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
        tabs: [
          {
            id: "tab-time",
            type: "time",
            label: "By Time",
            display: "line",
            definitions: [
              { slotIndex: 0, dimensionId: "created_at" },
              { slotIndex: 1, dimensionId: "updated_at" },
            ],
          },
        ],
        selectedTabId: "tab-time",
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
        tabs: [],
        selectedTabId: null,
      };

      const hash = encodeStateOrThrow(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("preserves per-slot dimension mappings when same metric has different breakouts across multiple tabs", () => {
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
        tabs: [
          {
            id: "tab-time",
            type: "time",
            label: "By Time",
            display: "line",
            definitions: [
              { slotIndex: 0, dimensionId: "created_at" },
              { slotIndex: 1, dimensionId: "shipped_at" },
            ],
          },
          {
            id: "tab-cat",
            type: "category",
            label: "By Category",
            display: "bar",
            definitions: [
              { slotIndex: 0, dimensionId: "product_category" },
              { slotIndex: 1, dimensionId: "user_state" },
            ],
          },
        ],
        selectedTabId: "tab-cat",
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
        tabs: [
          {
            id: "tab-time",
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
        selectedTabId: "tab-time",
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
      expect(first.tabs).not.toBe(second.tabs);
    });
  });

  describe("deserializeFormulaEntities", () => {
    function emptyState(
      overrides: Partial<SerializedMetricsViewerPageState> = {},
    ): SerializedMetricsViewerPageState {
      return {
        formulaEntities: [],
        tabs: [],
        selectedTabId: null,
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
            { type: "metric", sourceId: "metric:1", count: 1 },
            { type: "operator", op: "+" },
            { type: "metric", sourceId: "metric:2", count: 1 },
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
            { type: "metric", sourceId: "metric:1", count: 1 },
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
            { type: "metric", sourceId: "metric:1", count: 1 },
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
