import _ from "underscore";

import {
  cardHasBecomeDirty,
  computeMaxDecimalsForValues,
  getCardAfterVisualizationClick,
  getColumnCardinality,
  getFriendlyName,
  getDefaultDimensionsAndMetrics,
  preserveExistingColumnsOrder,
  computeSplit,
  getDefaultPivotColumn,
} from "metabase/visualizations/lib/utils";
import { createMockColumn } from "metabase-types/api/mocks";

// TODO Atte Keinänen 5/31/17 Rewrite tests using metabase-lib methods instead of a raw format

const baseQuery = {
  database: 1,
  type: "query",
  query: {
    "source-table": 2,
    aggregation: [["count"]],
    breakout: [["field", 2, null]],
  },
};
const derivedQuery = {
  ...baseQuery,
  query: {
    ...baseQuery.query,
    filter: ["time-interval", ["field", 1, null], -7, "day"],
  },
};

const breakoutMultiseriesQuery = {
  ...baseQuery,
  query: {
    ...baseQuery.query,
    breakout: [
      ...baseQuery.query.breakout,
      ["field", 10, { "source-field": 1 }],
    ],
  },
};
const derivedBreakoutMultiseriesQuery = {
  ...breakoutMultiseriesQuery,
  query: {
    ...breakoutMultiseriesQuery.query,
    filter: ["time-interval", ["field", 1, null], -7, "day"],
  },
};

const savedCard = {
  id: 3,
  dataset_query: baseQuery,
  display: "line",
};
const clonedSavedCard = {
  id: 3,
  dataset_query: _.clone(baseQuery),
  display: "line",
};
const dirtyCardOnlyOriginalId = {
  original_card_id: 7,
  dataset_query: baseQuery,
  display: "line",
};

const derivedCard = {
  ...dirtyCardOnlyOriginalId,
  dataset_query: derivedQuery,
};
const derivedCardModifiedId = {
  ...savedCard,
  dataset_query: derivedQuery,
};
const derivedDirtyCard = {
  ...dirtyCardOnlyOriginalId,
  dataset_query: derivedQuery,
};

const derivedCardWithDifferentDisplay = {
  ...savedCard,
  display: "table",
};

const savedMultiseriesCard = {
  ...savedCard,
  dataset_query: breakoutMultiseriesQuery,
};
const derivedMultiseriesCard = {
  // id is not present when drilling through series / multiseries
  dataset_query: derivedBreakoutMultiseriesQuery,
  display: savedCard.display,
};
const newCard = {
  dataset_query: baseQuery,
  display: "line",
};
const modifiedNewCard = {
  dataset_query: derivedQuery,
  display: "line",
};

describe("metabase/visualization/lib/utils", () => {
  describe("cardHasBecomeDirty", () => {
    it("should consider cards with different display types dirty", () => {
      // mostly for action widget actions that only change the display type
      expect(
        cardHasBecomeDirty(derivedCardWithDifferentDisplay, savedCard),
      ).toEqual(true);
    });

    it("should consider cards with different data data dirty", () => {
      expect(cardHasBecomeDirty(derivedCard, savedCard)).toEqual(true);
    });

    it("should consider cards with same display type and data clean", () => {
      // i.e. the card is practically the same as original card
      expect(cardHasBecomeDirty(clonedSavedCard, savedCard)).toEqual(false);
    });
  });

  describe("getCardAfterVisualizationClick", () => {
    it("should use the id of a previous card in case of a multi-breakout visualization", () => {
      expect(
        getCardAfterVisualizationClick(
          derivedMultiseriesCard,
          savedMultiseriesCard,
        ),
      ).toMatchObject({ original_card_id: savedMultiseriesCard.id });
    });

    // TODO: Atte Keinänen 5/31/17 This scenario is a little fuzzy at the moment as there have been
    // some specific corner cases where the id in previousCard is wrong/missing
    // We should validate that previousCard always has an id as it should
    it("if the new card contains the id it's more reliable to use it for initializing lineage", () => {
      expect(
        getCardAfterVisualizationClick(derivedCardModifiedId, savedCard),
      ).toMatchObject({ original_card_id: derivedCardModifiedId.id });
    });

    it("should be able to continue the lineage even if the previous question was dirty already", () => {
      expect(
        getCardAfterVisualizationClick(
          derivedDirtyCard,
          dirtyCardOnlyOriginalId,
        ),
      ).toMatchObject({
        original_card_id: dirtyCardOnlyOriginalId.original_card_id,
      });
    });

    it("should just pass the new question if the previous question was new", () => {
      expect(
        getCardAfterVisualizationClick(modifiedNewCard, newCard),
      ).toMatchObject(modifiedNewCard);
    });

    it("should populate original_card_id even if the question isn't modified", () => {
      // This is the hack to interoperate with questionUrlWithParameters when
      // dashboard parameters are applied to a dashcards
      expect(
        getCardAfterVisualizationClick(clonedSavedCard, savedCard),
      ).toMatchObject({ original_card_id: savedCard.id });
    });
  });

  describe("getColumnCardinality", () => {
    it("should get column cardinality", () => {
      const cols = [{}];
      const rows = [[1], [2], [3], [3]];
      expect(getColumnCardinality(cols, rows, 0)).toEqual(3);
    });
    it("should get column cardinality for frozen column", () => {
      const cols = [{}];
      const rows = [[1], [2], [3], [3]];
      Object.freeze(cols[0]);
      expect(getColumnCardinality(cols, rows, 0)).toEqual(3);
    });
  });

  describe("getFriendlyName", () => {
    it("should return friendly name for built-in aggregations", () => {
      expect(getFriendlyName({ name: "avg", display_name: "avg" })).toBe(
        "Average",
      );
    });
    it("should return friendly name for duplicate built-in aggregations", () => {
      expect(getFriendlyName({ name: "avg_2", display_name: "avg" })).toBe(
        "Average",
      );
    });
    it("should return display_name for non built-in aggregations", () => {
      expect(getFriendlyName({ name: "foo", display_name: "Foo" })).toBe("Foo");
    });
    it("should return display_name for built-in aggregations", () => {
      expect(getFriendlyName({ name: "avg", display_name: "Foo" })).toBe("Foo");
    });
  });

  describe("computeMaxDecimalsForValues", () => {
    it("should correctly compute max decimals for normal numbers", () => {
      const options = { maximumSignificantDigits: 2 };
      const testCases = [
        [[123, 321], 0],
        [[1.2, 321], 1],
        [[1, 0.123], 2],
      ];
      testCases.forEach(([values, decimals]) =>
        expect(computeMaxDecimalsForValues(values, options)).toBe(decimals),
      );
    });

    it("should correctly compute max decimals for percentages", () => {
      const options = { maximumSignificantDigits: 2, style: "percent" };
      const testCases = [
        [[0.12, 0.123], 0],
        [[12, 0.012], 1],
        [[0.9999, 0.0001], 2],
      ];
      testCases.forEach(([values, decimals]) =>
        expect(computeMaxDecimalsForValues(values, options)).toBe(decimals),
      );
    });
  });

  describe("getDefaultDimensionsAndMetrics", () => {
    it("should pick the lower cardinality dimension for second dimension", () => {
      expect(
        getDefaultDimensionsAndMetrics([
          {
            data: {
              rows: _.range(0, 100).map(v => [0, 0, v]),
              cols: [
                {
                  name: "count",
                  base_type: "type/Number",
                  source: "aggregation",
                },
                {
                  name: "low",
                  base_type: "type/Number",
                  source: "breakout",
                },
                {
                  name: "high",
                  base_type: "type/Number",
                  source: "breakout",
                },
              ],
            },
          },
        ]),
      ).toEqual({ dimensions: ["high", "low"], metrics: ["count"] });
    });
    it("should pick a high cardinality dimension for the second dimension", () => {
      expect(
        getDefaultDimensionsAndMetrics([
          {
            data: {
              rows: _.range(0, 101).map(v => [0, v, v]),
              cols: [
                {
                  name: "count",
                  base_type: "type/Number",
                  source: "aggregation",
                },
                {
                  name: "high1",
                  base_type: "type/Number",
                  source: "breakout",
                },
                {
                  name: "high2",
                  base_type: "type/Number",
                  source: "breakout",
                },
              ],
            },
          },
        ]),
      ).toEqual({ dimensions: ["high1"], metrics: ["count"] });
    });
    it("should pick date for the first dimension", () => {
      expect(
        getDefaultDimensionsAndMetrics([
          {
            data: {
              rows: [[0, 0, 0]],
              cols: [
                {
                  name: "count",
                  base_type: "type/Number",
                  source: "aggregation",
                },
                {
                  name: "date",
                  base_type: "type/DateTime",
                  source: "breakout",
                },
                {
                  name: "category",
                  base_type: "type/Text",
                  source: "breakout",
                },
              ],
            },
          },
        ]),
      ).toEqual({ dimensions: ["date", "category"], metrics: ["count"] });
    });
  });

  describe("preserveExistingColumnsOrder", () => {
    it("preserves order of columns when one is renamed", () => {
      const columns = preserveExistingColumnsOrder(
        ["b", "a"],
        ["a_renamed", "b"],
      );
      expect(columns).toStrictEqual(["b", "a_renamed"]);
    });

    it("returns new columns when no previous one specified", () => {
      expect(
        preserveExistingColumnsOrder(null, ["a_renamed", "b"]),
      ).toStrictEqual(["a_renamed", "b"]);

      expect(
        preserveExistingColumnsOrder([], ["a_renamed", "b"]),
      ).toStrictEqual(["a_renamed", "b"]);
    });

    it("returns no columns if when there are no new columns", () => {
      expect(
        preserveExistingColumnsOrder(["a_renamed", "b"], []),
      ).toStrictEqual([]);
    });

    it("returns new columns in order when previous columns completely different", () => {
      expect(
        preserveExistingColumnsOrder(["a", "b"], ["c", "d"]),
      ).toStrictEqual(["c", "d"]);
    });
  });

  describe("computeSplit", () => {
    const extents = [
      [6, 8],
      [9, 13],
      [6, 7],
      [1, 1],
      [10, 13],
      [15, 19],
      [5, 6],
      [5, 10],
      [9, 13],
      [2, 6],
      [12, 15],
      [1, 1],
    ];

    it("should return the same number of series as given", () => {
      expect(computeSplit(extents).flat()).toHaveLength(extents.length);
    });
  });

  describe("getDefaultPivotColumn", () => {
    const lowestCardinalityColumn = createMockColumn({
      name: "lowest_cardinality",
    });
    const lowCardinalityColumn = createMockColumn({ name: "low_cardinality" });
    const highCardinalityColumn = createMockColumn({
      name: "high_cardinality",
    });
    const highestCardinalityColumn = createMockColumn({
      name: "highest_cardinality",
    });

    const lowestCardinality = 5;
    const lowCardinality = 16;
    const highCardinality = 17;
    const highestCardinality = 50;

    it("returns null if all columns has cardinality > 16", () => {
      const cols = [highestCardinalityColumn, highCardinalityColumn];
      const rows = _.range(highestCardinality).map(n => [
        n,
        n % highCardinality,
      ]);

      expect(getDefaultPivotColumn(cols, rows)).toBeNull();
    });

    it("returns lowest cardinality column from ones where it is <= 16", () => {
      const cols = [
        highestCardinalityColumn,
        highCardinalityColumn,
        lowCardinalityColumn,
        lowestCardinalityColumn,
      ];
      const rows = _.range(highestCardinality).map(n => [
        n,
        n % highCardinality,
        n % lowCardinality,
        n % lowestCardinality,
      ]);

      expect(getDefaultPivotColumn(cols, rows)).toEqual(
        lowestCardinalityColumn,
      );
    });

    it("ignores low cardinality non-dimension columns", () => {
      const cols = [
        lowCardinalityColumn,
        createMockColumn({
          name: "lowest_cardinality_aggregation",
          source: "aggregation",
        }),
      ];
      const rows = _.range(lowCardinality).map(n => [n, 1]);

      expect(getDefaultPivotColumn(cols, rows)).toEqual(lowCardinalityColumn);
    });
  });
});
