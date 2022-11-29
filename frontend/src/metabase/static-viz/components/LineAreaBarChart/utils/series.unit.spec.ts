import { merge, setIn } from "icepick";
import { colors } from "metabase/lib/colors";
import type {
  ChartSettings,
  SeriesWithOneOrLessDimensions,
  SeriesWithTwoDimensions,
} from "../../XYChart/types";
import { getSeriesWithColors, getSeriesWithLegends } from "./series";

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
};

describe("getSeriesWithColors", () => {
  it("should return an empty series given an empty series", () => {
    const seriesWithColors = getSeriesWithColors([], settings, getPalette({}));

    expect(seriesWithColors).toEqual([]);
  });

  describe("Series without ones or less dimensions", () => {
    const multipleSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          name: "Count",
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
    ];

    const multipleSeriesDashcard: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          name: "Count",
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
      [
        {
          name: "Count",
          cardName: "Area chart",
          yAxisPosition: "left",
          type: "area",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeries,
        settings,
        getPalette({}),
      );

      const expectedSeries = [
        [
          {
            color: "#509EE3", // brand color
            name: expect.anything(),
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
        multipleSeries,
        settings,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            name: expect.anything(),
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

    it("it should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeries,
        merge(settings, {
          series_settings: {
            count: {
              color: "#987654",
            },
          },
        }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
      );

      const expectedSeries = [
        [
          {
            color: "#987654", // column color
            name: expect.anything(),
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

    it("it should assign colors on multiple series dashcard", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeriesDashcard,
        settings,
        getPalette({}),
      );

      const expectedSeries = [
        [
          {
            color: "#509EE3", // brand color
            name: expect.anything(),
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
            name: expect.anything(),
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
    const multipleSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          name: "Sum of Total",
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
          column: {
            name: "sum",
            source: "aggregation",
            display_name: "Sum of Total",
          },
        },
      ],
    ];

    it("should assign colors from preferred color", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeries,
        merge(settings, { x: { type: "timeseries" } }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
      );

      const expectedSeries = [
        [
          {
            color: "#88BF4D", // accent1 color
            name: expect.anything(),
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
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({ accent1: "#123456", summarize: "#ffffff" }),
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            name: expect.anything(),
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
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
          series_settings: {
            sum: {
              color: "#987654",
            },
          },
        }),
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
      );

      const expectedSeries = [
        [
          {
            color: "#987654", // column color
            name: expect.anything(),
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
    const multipleSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    const multipleSeriesDashcard: SeriesWithTwoDimensions[][] = [
      [
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],

      [
        {
          name: null,
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({}),
      );

      const expectedSeries = [
        [
          {
            color: "#EF8C8C", // accent3 color
            name: null,
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F9D45C", // accent4 color
            name: null,
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
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
        }),
        getPalette({ accent3: "#123456" }),
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            name: null,
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F9D45C", // accent4 color
            name: null,
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
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
          series_settings: {
            2017: {
              color: "#987654",
            },
          },
        }),
        getPalette({ accent3: "#123456" }),
      );

      const expectedSeries = [
        [
          {
            color: "#123456", // whitelabel color
            name: null,
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#987654", // column color
            name: null,
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

    it("it should assign colors on multiple series dashcard", () => {
      const seriesWithColors = getSeriesWithColors(
        multipleSeriesDashcard,
        settings,
        getPalette({}),
      );

      const expectedSeries = [
        [
          {
            color: "#F9D45C", // brand color
            name: null,
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#F2A86F", // column color
            name: null,
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
            name: null,
            cardName: expect.anything(),
            yAxisPosition: expect.anything(),
            type: expect.anything(),
            data: expect.anything(),
            column: expect.anything(),
            breakoutValue: expect.anything(),
          },
          {
            color: "#7172AD", // column color
            name: null,
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
    const seriesWithLegends = getSeriesWithLegends([], settings);

    expect(seriesWithLegends).toEqual([]);
  });

  describe("Series without ones or less dimensions", () => {
    const multipleSeries: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          name: "Count",
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
    ];

    const multipleSeriesDashcard: SeriesWithOneOrLessDimensions[][] = [
      [
        {
          name: "Count",
          cardName: "Bar chart",
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
      [
        {
          name: "Count",
          cardName: "Area chart",
          yAxisPosition: "left",
          type: "area",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
          column: {
            name: "count",
            source: "aggregation",
            display_name: "Count",
          },
        },
      ],
    ];

    it("should assign legends given series", () => {
      const seriesWithLegends = getSeriesWithLegends(multipleSeries, settings);

      const expectedSeries = [
        [
          {
            name: "Count",
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

    it("it should assign legends from column custom name", () => {
      const seriesWithLegends = getSeriesWithLegends(
        // This might not be apparent, but series' `name` would be set to
        // custom metric name for series with one or less dimensions.
        setIn(multipleSeries, [0, 0, "name"], "Custom count"),
        settings,
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

    it("it should assign legends on multiple series dashcard", () => {
      const seriesWithLegends = getSeriesWithLegends(
        multipleSeriesDashcard,
        settings,
      );

      const expectedSeries = [
        [
          {
            name: "Count",
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
    const multipleSeries: SeriesWithTwoDimensions[][] = [
      [
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    const multipleSeriesDashcard: SeriesWithTwoDimensions[][] = [
      [
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Area chart",
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],

      [
        {
          name: null,
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2016-01-01T00:00:00Z",
        },
        {
          name: null,
          cardName: "Bar chart",
          type: "bar",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
          column: {
            semantic_type: "type/CreationTimestamp",
            unit: "year",
            name: "CREATED_AT",
            source: "breakout",
            display_name: "Created At",
          },
          breakoutValue: "2017-01-01T00:00:00Z",
        },
      ],
    ];

    it("should assign legends given series", () => {
      const seriesWithLegends = getSeriesWithLegends(
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
        }),
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
        multipleSeries,
        merge(settings, {
          x: { type: "timeseries" },
          series_settings: {
            2017: {
              title: "custom 2017",
            },
          },
        }),
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

    it("it should assign legends on multiple series dashcard", () => {
      const seriesWithLegends = getSeriesWithLegends(
        multipleSeriesDashcard,
        settings,
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
