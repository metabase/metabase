import type { DimensionFilterValue } from "./metrics";
import {
  type SerializedMetricsViewerPageState,
  decodeState,
  encodeState,
} from "./url-serialization";

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
      };

      const hash = encodeState(state);
      const decoded = decodeState(hash);
      expect(decoded).toEqual(state);
    });

    it("round-trips an empty state", () => {
      const state: SerializedMetricsViewerPageState = {
        sources: [],
        tabs: [],
        selectedTabId: null,
      };

      const hash = encodeState(state);
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
      };

      const hash = encodeState(state);
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
      });
    });

    it("returns empty state for invalid base64", () => {
      expect(decodeState("!!!not-valid-base64!!!")).toEqual({
        sources: [],
        tabs: [],
        selectedTabId: null,
      });
    });

    it("returns empty state for valid base64 but invalid JSON", () => {
      const hash = btoa("not json");
      expect(decodeState(hash)).toEqual({
        sources: [],
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
      };

      const hash = encodeState(state);
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
      };

      const hash = encodeState(state);
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
      };

      const hash = encodeState(state);
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
      };
      return decodeState(encodeState(state)).sources[0].filters![0].value;
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

  describe("decodeState returns independent objects", () => {
    it("returns distinct objects for separate calls", () => {
      const first = decodeState("");
      const second = decodeState("");
      expect(first).not.toBe(second);
      expect(first.sources).not.toBe(second.sources);
      expect(first.tabs).not.toBe(second.tabs);
    });
  });
});
