import {
  cardHasBecomeDirty,
  computeMaxDecimalsForValues,
  getCardAfterVisualizationClick,
  getColumnCardinality,
  getFriendlyName,
  getDefaultDimensionsAndMetrics,
} from "metabase/visualizations/lib/utils";

import _ from "underscore";

// TODO Atte Keinänen 5/31/17 Rewrite tests using metabase-lib methods instead of a raw format

const baseQuery = {
  database: 1,
  type: "query",
  query: {
    "source-table": 2,
    aggregation: [["count"]],
    breakout: [["field-id", 2]],
  },
};
const derivedQuery = {
  ...baseQuery,
  query: {
    ...baseQuery.query,
    filter: ["time-interval", ["field-id", 1], -7, "day"],
  },
};

const breakoutMultiseriesQuery = {
  ...baseQuery,
  query: {
    ...baseQuery.query,
    breakout: [
      ...baseQuery.query.breakout,
      ["fk->", ["field-id", 1], ["field-id", 10]],
    ],
  },
};
const derivedBreakoutMultiseriesQuery = {
  ...breakoutMultiseriesQuery,
  query: {
    ...breakoutMultiseriesQuery.query,
    filter: ["time-interval", ["field-id", 1], -7, "day"],
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
      const testCases = [[[123, 321], 0], [[1.2, 321], 1], [[1, 0.123], 2]];
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
});
