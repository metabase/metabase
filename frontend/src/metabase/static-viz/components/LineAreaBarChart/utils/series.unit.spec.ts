import { merge } from "icepick";
import { colors } from "metabase/lib/colors";
import { createMockColumn } from "metabase-types/api/mocks";
import type {
  ChartSettings,
  SeriesWithOneOrLessDimensions,
  SeriesWithTwoDimensions,
} from "../../XYChart/types";
import {
  getSeriesWithColors,
  getSeriesWithLegends,
  reorderSeries,
} from "./series";

const settings: ChartSettings = {
  x: {
    type: "ordinal",
  },
  y: {
    type: "linear",
  },
  labels: {
    left: "Count",
    bottom: "Date",
  },
  visualization_settings: {},
};

describe("getSeriesWithColors", () => {
  it("should return an empty series given an empty series", () => {
    const seriesWithColors = getSeriesWithColors(settings, getPalette({}), []);

    expect(seriesWithColors).toEqual([]);
  });

  describe("Series without one or less dimensions", () => {
    const singleCardSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
    ];

    const multipleCardSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
      [
        {
          cardName: "Area chart",
          yAxisPosition: "left",
          type: "area",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        settings,
        getPalette({}),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#509EE3", // brand color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        settings,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          visualization_settings: {
            series_settings: {
              count: {
                color: "#987654",
              },
            },
          },
        }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#987654", // column color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors on multiple series dashcard", () => {
      const seriesWithColors = getSeriesWithColors(
        settings,
        getPalette({}),
        multipleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#509EE3", // brand color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
        [
          {
            color: "#EF8C8C",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });
  });

  describe("Series with preferred colors", () => {
    const singleCardSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
          column: createMockColumn({
            name: "sum",
            source: "aggregation",
            display_name: "Sum of Total",
          }),
        },
      ],
    ];

    it("should assign colors from preferred color", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, { x: { type: "timeseries" } }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#88BF4D", // accent1 color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({ accent1: "#123456", summarize: "#ffffff" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          x: { type: "timeseries" },
          visualization_settings: {
            series_settings: {
              sum: {
                color: "#987654",
              },
            },
          },
        }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#987654", // column color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });
  });

  describe("Series with 2 dimension", () => {
    const singleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    const multipleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],

      [
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({}),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#EF8C8C", // accent3 color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F9D45C", // accent4 color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({ accent3: "#123456" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F9D45C", // accent4 color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        merge(settings, {
          x: { type: "timeseries" },
          visualization_settings: {
            series_settings: {
              2017: {
                color: "#987654",
              },
            },
          },
        }),
        getPalette({ accent3: "#123456" }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#987654", // column color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors on multiple series dashcard", () => {
      const seriesWithColors = getSeriesWithColors(
        settings,
        getPalette({}),
        multipleCardSeries,
      );

      const expectedSeries = [
        [
          {
            color: "#F9D45C", // brand color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F2A86F", // column color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
        [
          {
            color: "#98D9D9",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#7172AD", // column color
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });
  });
});

function getPalette(instanceColors: Record<string, string>) {
  return {
    ...colors,
    ...instanceColors,
  };
}

describe("getSeriesWithLegends", () => {
  it("should return an empty series given an empty series", () => {
    const seriesWithLegends = getSeriesWithLegends(settings, []);

    expect(seriesWithLegends).toEqual([]);
  });

  describe("Series without ones or less dimensions", () => {
    const singleCardSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
    ];

    const multipleCardSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
      [
        {
          cardName: "Area chart",
          yAxisPosition: "left",
          type: "area",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: createMockColumn({
            name: "count",
            source: "aggregation",
            display_name: "Count",
          }),
        },
      ],
    ];

    it("should assign legends given series", () => {
      const seriesWithLegends = getSeriesWithLegends(
        settings,
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "Bar chart",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });

    it("should assign legends from column custom name", () => {
      const seriesWithLegends = getSeriesWithLegends(
        merge(settings, {
          x: { type: "timeseries" },
          visualization_settings: {
            series_settings: {
              count: {
                title: "Custom count",
              },
            },
          },
        }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "Custom count",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });

    it("should assign legends on multiple series dashcard", () => {
      const seriesWithLegends = getSeriesWithLegends(
        settings,
        multipleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "Bar chart",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
        [
          {
            name: "Area chart",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });
  });

  describe("Series with 2 dimension", () => {
    const singleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    const multipleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],

      [
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    it("should assign legends given series", () => {
      const seriesWithLegends = getSeriesWithLegends(
        merge(settings, {
          x: { type: "timeseries" },
        }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "2016",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            name: "2017",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });

    it("should assign legends from column custom name", () => {
      const seriesWithLegends = getSeriesWithLegends(
        merge(settings, {
          x: { type: "timeseries" },
          visualization_settings: {
            series_settings: {
              2017: {
                title: "custom 2017",
              },
            },
          },
        }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "2016",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            name: "custom 2017",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });

    it("should assign legends on multiple series dashcard", () => {
      const seriesWithLegends = getSeriesWithLegends(
        settings,
        multipleCardSeries,
      );

      const expectedSeries = [
        [
          {
            name: "Area chart: 2016",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            name: "Area chart: 2017",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
        [
          {
            name: "Bar chart: 2016",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            name: "Bar chart: 2017",
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
        ],
      ];

      expect(seriesWithLegends).toEqual(expectedSeries);
    });
  });
});

describe("reorderSeries", () => {
  it("should return an empty series given an empty series", () => {
    const reorderedSeries = reorderSeries(settings, []);

    expect(reorderedSeries).toEqual([]);
  });

  describe("Series with 2 dimension", () => {
    const singleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    const multipleCardSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
      [
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: createMockColumn({
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          }),
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    it("should return the same series given no `graph.series_order` set", () => {
      const reorderedSeries = reorderSeries(settings, singleCardSeries);

      expect(reorderedSeries).toEqual(singleCardSeries);
    });

    it("should sort the series following `graph.series_order`", () => {
      const reorderedSeries = reorderSeries(
        merge(settings, {
          visualization_settings: {
            "graph.series_order": [
              {
                enabled: true,
                key: "2017",
                name: "2017",
              },
              {
                enabled: true,
                key: "2016",
                name: "2016",
              },
            ],
          },
        }),
        singleCardSeries,
      );

      const expectedSeries = [
        [
          expect.objectContaining({ breakoutValue: "2017-01-01T00:00:00Z" }),
          expect.objectContaining({ breakoutValue: "2016-01-01T00:00:00Z" }),
        ],
      ];

      expect(reorderedSeries).toEqual(expectedSeries);
    });

    it("should sort the series following `graph.series_order` on only enabled series", () => {
      const reorderedSeries = reorderSeries(
        merge(settings, {
          visualization_settings: {
            "graph.series_order": [
              {
                enabled: true,
                key: "2017",
                name: "2017",
              },
              {
                enabled: false,
                key: "2016",
                name: "2016",
              },
            ],
          },
        }),
        singleCardSeries,
      );

      const expectedSeries = [
        [expect.objectContaining({ breakoutValue: "2017-01-01T00:00:00Z" })],
      ];

      expect(reorderedSeries).toEqual(expectedSeries);
    });

    it("should not reorder when there are multiple cards", () => {
      const reorderedSeries = reorderSeries(
        merge(settings, {
          visualization_settings: {
            "graph.series_order": [
              {
                enabled: true,
                key: "2017",
                name: "2017",
              },
              {
                enabled: false,
                key: "2016",
                name: "2016",
              },
            ],
          },
        }),
        multipleCardSeries,
      );

      expect(reorderedSeries).toEqual(multipleCardSeries);
    });
  });
});
