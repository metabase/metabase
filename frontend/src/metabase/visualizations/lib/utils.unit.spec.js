import _ from "underscore";

import {
  cardHasBecomeDirty,
  computeMaxDecimalsForValues,
  computeSplit,
  findSensibleSankeyColumns,
  getCardAfterVisualizationClick,
  getColumnCardinality,
  getDefaultDimensionsAndMetrics,
  getDefaultPivotColumn,
  preserveExistingColumnsOrder,
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
    it("counts unique values in a column", () => {
      const cols = [
        createMockColumn({ name: "num" }),
        createMockColumn({ name: "str" }),
        createMockColumn({ name: "bool" }),
      ];
      const rows = [
        [1, "a", true],
        [2, "b", false],
        [1, "a", true],
        [3, "c", true],
        [null, "a", false],
      ];

      expect(getColumnCardinality(cols, rows, 0, 1)).toBe(4); // 1, 2, 3, null
      expect(getColumnCardinality(cols, rows, 1, 1)).toBe(3); // a, b, c
      expect(getColumnCardinality(cols, rows, 2, 1)).toBe(2); // true, false
    });

    it("treats different types as distinct values", () => {
      const cols = [createMockColumn({ name: "col" })];
      const rows = [["1"], [1], [""], [0], [null]];
      expect(getColumnCardinality(cols, rows, 0, 2)).toBe(5);
    });

    describe("caching", () => {
      it("does not collide for different cardIds", () => {
        const cols = [createMockColumn({ name: "col" })];

        expect(getColumnCardinality(cols, [[1], [2], [3]], 0, 20)).toBe(3);
        expect(getColumnCardinality(cols, [[1], [1], [1]], 0, 21)).toBe(1);
      });

      it("does not collide for different row counts", () => {
        const cols = [createMockColumn({ name: "col" })];

        expect(getColumnCardinality(cols, [[1], [2], [3]], 0, 30)).toBe(3);
        expect(getColumnCardinality(cols, [[1], [1], [2], [2]], 0, 30)).toBe(2);
      });

      it("does not collide for different columns", () => {
        const cols = [
          createMockColumn({ name: "a" }),
          createMockColumn({ name: "b" }),
        ];
        const rows = [
          [1, "x"],
          [2, "y"],
          [1, "z"],
        ];

        expect(getColumnCardinality(cols, rows, 0, 40)).toBe(2);
        expect(getColumnCardinality(cols, rows, 1, 40)).toBe(3);
      });

      it("does not collide for different column indices with same column key, rows count, card id", () => {
        const col = createMockColumn({ name: "col" });
        const cols1 = [col, createMockColumn({ name: "other" })];
        const cols2 = [createMockColumn({ name: "other" }), col];

        expect(
          getColumnCardinality(
            cols1,
            [
              [1, 9],
              [2, 9],
              [3, 9],
            ],
            0,
            50,
          ),
        ).toBe(3);
        expect(
          getColumnCardinality(
            cols2,
            [
              [9, 1],
              [9, 1],
              [9, 1],
            ],
            1,
            50,
          ),
        ).toBe(1);
      });
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
              rows: _.range(0, 100).map((v) => [0, 0, v]),
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
              rows: _.range(0, 101).map((v) => [0, v, v]),
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
      const rows = _.range(highestCardinality).map((n) => [
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
      const rows = _.range(highestCardinality).map((n) => [
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
      const rows = _.range(lowCardinality).map((n) => [n, 1]);

      expect(getDefaultPivotColumn(cols, rows)).toEqual(lowCardinalityColumn);
    });
  });

  describe("findSensibleSankeyColumns", () => {
    it("should return null values when no data is provided", () => {
      expect(findSensibleSankeyColumns(null)).toEqual(null);
    });

    it("should detect source, target, and metric columns on a suitable dataset", () => {
      const cols = [
        createMockColumn({
          name: "source",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "target",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "amount",
          base_type: "type/Number",
          semantic_type: "type/Quantity",
        }),
      ];

      const rows = [
        ["A", "B", 10],
        ["A", "C", 20],
        ["B", "C", 15],
      ];

      const data = { cols, rows };

      expect(findSensibleSankeyColumns(data)).toEqual({
        source: "source",
        target: "target",
        metric: "amount",
      });
    });

    it("should ignore dimension columns with high cardinality", () => {
      const cols = [
        createMockColumn({
          name: "high_cardinality",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "good_source",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "good_target",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "amount",
          base_type: "type/Number",
          semantic_type: "type/Quantity",
        }),
      ];

      const rows = [];
      for (let i = 0; i < 200; i++) {
        // Make sure good_source and good_target have overlapping values
        const source = (i % 3) + 1; // 1, 2, 3
        const target = ((i + 1) % 3) + 1; // 2, 3, 1
        rows.push([`unique_${i}`, source.toString(), target.toString(), 10]);
      }

      const data = { cols, rows };

      expect(findSensibleSankeyColumns(data)).toEqual({
        source: "good_source",
        target: "good_target",
        metric: "amount",
      });
    });

    it("should ignore dimension date columns", () => {
      const cols = [
        createMockColumn({
          name: "date",
          base_type: "type/DateTime",
          semantic_type: "type/DateTime",
        }),
        createMockColumn({
          name: "source",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "target",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "amount",
          base_type: "type/Number",
          semantic_type: "type/Quantity",
        }),
      ];

      const rows = [
        ["2023-01-01", "A", "B", 10],
        ["2023-01-02", "A", "C", 20],
        ["2023-01-03", "B", "C", 30],
      ];

      const data = { cols, rows };

      expect(findSensibleSankeyColumns(data)).toEqual({
        source: "source",
        target: "target",
        metric: "amount",
      });
    });

    it("should return source and target without overlapping values if that is the only option", () => {
      const cols = [
        createMockColumn({
          name: "dim1",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "dim2",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "amount",
          base_type: "type/Number",
          semantic_type: "type/Quantity",
        }),
      ];

      const rows = [
        ["A", "X", 10],
        ["B", "Y", 20],
        ["C", "Z", 30],
      ];

      const data = { cols, rows };

      expect(findSensibleSankeyColumns(data)).toEqual({
        source: "dim1",
        target: "dim2",
        metric: "amount",
      });
    });

    it("should not return source and target when there is only one dimension", () => {
      const cols = [
        createMockColumn({
          name: "single_dim",
          base_type: "type/Text",
          semantic_type: "type/Category",
        }),
        createMockColumn({
          name: "amount",
          base_type: "type/Number",
          semantic_type: "type/Quantity",
        }),
      ];

      const rows = [
        ["A", 10],
        ["B", 20],
        ["C", 30],
      ];

      const data = { cols, rows };

      expect(findSensibleSankeyColumns(data)).toEqual(null);
    });
  });
});
