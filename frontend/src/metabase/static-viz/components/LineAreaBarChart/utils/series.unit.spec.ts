import { merge } from "icepick";
import { colors } from "metabase/lib/colors";
import type {
  ChartSettings,
  SeriesWithBreakoutValues,
  SeriesWithoutBreakoutValues,
} from "../../XYChart/types";
import { getSeriesWithColors } from "./series";

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
    const seriesWithColors = getSeriesWithColors([], getPalette({}), settings);

    expect(seriesWithColors).toEqual([]);
  });

  describe("Series without breakout values", () => {
    const series: SeriesWithoutBreakoutValues[] = [
      {
        name: "Count",
        yAxisPosition: "left",
        type: "bar",
        data: [
          ["Doohickey", 3976],
          ["Gadget", 4939],
          ["Gizmo", 4784],
          ["Widget", 5061],
        ],
        seriesKey: "count",
      },
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({}),
        settings,
      );

      const expectedSeries = [
        {
          name: "Count",
          color: "#509EE3", // brand color
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        settings,
      );

      const expectedSeries = [
        {
          name: "Count",
          color: "#123456", // whitelabel color
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("it should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        merge(settings, {
          series_settings: {
            count: {
              color: "#987654",
            },
          },
        }),
      );

      const expectedSeries = [
        {
          name: "Count",
          color: "#987654", // column color
          yAxisPosition: "left",
          type: "bar",
          data: [
            ["Doohickey", 3976],
            ["Gadget", 4939],
            ["Gizmo", 4784],
            ["Widget", 5061],
          ],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });
  });

  describe("Series with preferred colors", () => {
    const series: SeriesWithoutBreakoutValues[] = [
      {
        name: "Sum of Total",
        yAxisPosition: "left",
        type: "bar",
        data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
        seriesKey: "sum",
      },
    ];

    it("should assign colors from preferred color", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        merge(settings, { x: { type: "timeseries" } }),
      );

      const expectedSeries = [
        {
          name: "Sum of Total",
          color: "#88BF4D", // accent1 color
          yAxisPosition: "left",
          type: "bar",
          data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ accent1: "#123456", summarize: "#ffffff" }),
        merge(settings, {
          x: { type: "timeseries" },
        }),
      );

      const expectedSeries = [
        {
          name: "Sum of Total",
          color: "#123456", // whitelabel color
          yAxisPosition: "left",
          type: "bar",
          data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ brand: "#123456", summarize: "#ffffff" }),
        merge(settings, {
          x: { type: "timeseries" },
          series_settings: {
            sum: {
              color: "#987654",
            },
          },
        }),
      );

      const expectedSeries = [
        {
          name: "Sum of Total",
          color: "#987654", // column color
          yAxisPosition: "left",
          type: "bar",
          data: [["2016-04-24T00:00:00Z", 52.75594257942132]],
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });
  });

  describe("Series with breakout values", () => {
    const series: SeriesWithBreakoutValues[] = [
      {
        name: "2016-01-01T00:00:00Z",
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
      },
      {
        name: "2017-01-01T00:00:00Z",
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
      },
    ];

    it("should assign colors given series", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({}),
        merge(settings, {
          x: { type: "timeseries" },
        }),
      );

      const expectedSeries = [
        {
          name: "2016-01-01T00:00:00Z",
          color: "#EF8C8C", // accent3 color
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
        },
        {
          name: "2017-01-01T00:00:00Z",
          color: "#F9D45C", // accent4 color
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from whitelabel colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ accent3: "#123456" }),
        merge(settings, {
          x: { type: "timeseries" },
        }),
      );

      const expectedSeries = [
        {
          name: "2016-01-01T00:00:00Z",
          color: "#123456", // whitelabel color
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
        },
        {
          name: "2017-01-01T00:00:00Z",
          color: "#F9D45C", // accent4 color
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
        },
      ];

      expect(seriesWithColors).toEqual(expectedSeries);
    });

    it("should assign colors from column colors", () => {
      const seriesWithColors = getSeriesWithColors(
        series,
        getPalette({ accent3: "#123456" }),
        merge(settings, {
          x: { type: "timeseries" },
          series_settings: {
            2017: {
              color: "#987654",
            },
          },
        }),
      );

      const expectedSeries = [
        {
          name: "2016-01-01T00:00:00Z",
          color: "#123456", // whitelabel color
          type: "area",
          data: [
            ["Doohickey", 177],
            ["Gadget", 199],
            ["Gizmo", 158],
            ["Widget", 210],
          ],
          yAxisPosition: "left",
        },
        {
          name: "2017-01-01T00:00:00Z",
          color: "#987654", // column color
          type: "area",
          data: [
            ["Doohickey", 1206],
            ["Gadget", 1505],
            ["Gizmo", 1592],
            ["Widget", 1531],
          ],
          yAxisPosition: "left",
        },
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
