import { Series } from "../types";
import { calculateStackedItems, sortSeries } from "./series";

describe("sortSeries", () => {
  it("sorts timeseries data", () => {
    const sortedSeries = sortSeries(
      [
        {
          name: "series",
          color: "#ef8c8c",
          yAxisPosition: "right",
          type: "line",
          data: [
            ["2020-10-22", 3],
            ["2020-10-20", 4],
            ["2020-10-21", 5],
          ],
        },
      ],
      "timeseries",
    );

    expect(sortedSeries).toStrictEqual([
      {
        name: "series",
        color: "#ef8c8c",
        yAxisPosition: "right",
        type: "line",
        data: [
          ["2020-10-20", 4],
          ["2020-10-21", 5],
          ["2020-10-22", 3],
        ],
      },
    ]);
  });

  it("sorts numeric data", () => {
    const sortedSeries = sortSeries(
      [
        {
          name: "series",
          color: "#ef8c8c",
          yAxisPosition: "right",
          type: "line",
          data: [
            [5, 3],
            [4, 4],
            [1, 5],
          ],
        },
      ],
      "linear",
    );

    expect(sortedSeries).toStrictEqual([
      {
        name: "series",
        color: "#ef8c8c",
        yAxisPosition: "right",
        type: "line",
        data: [
          [1, 5],
          [4, 4],
          [5, 3],
        ],
      },
    ]);
  });

  it("keeps existing order for ordinal data", () => {
    const sortedSeries = sortSeries(
      [
        {
          name: "series",
          color: "#ef8c8c",
          yAxisPosition: "right",
          type: "line",
          data: [
            ["stage 3", 3],
            ["stage 2", 4],
            ["stage 1", 5],
          ],
        },
      ],
      "ordinal",
    );

    expect(sortedSeries).toStrictEqual([
      {
        name: "series",
        color: "#ef8c8c",
        yAxisPosition: "right",
        type: "line",
        data: [
          ["stage 3", 3],
          ["stage 2", 4],
          ["stage 1", 5],
        ],
      },
    ]);
  });
});

describe("calculateStackedItems", () => {
  const series: Series[] = [
    {
      name: "series 1",
      color: "#509ee3",
      yAxisPosition: "left",
      type: "area",
      data: [
        ["2020-10-18", 10],
        ["2020-10-19", -10],
      ],
    },
    {
      name: "series 2",
      color: "#a989c5",
      yAxisPosition: "left",
      type: "area",
      data: [
        ["2020-10-18", 20],
        ["2020-10-19", -20],
      ],
    },
    {
      name: "series 3",
      color: "#ef8c8c",
      yAxisPosition: "left",
      type: "area",
      data: [
        ["2020-10-18", -30],
        ["2020-10-19", 30],
      ],
    },
  ];

  it("calculates stacked items separating positive and negative values", () => {
    const stackedSeries = calculateStackedItems(series);

    /**
     *
     *  30|  2   3
     *  20|  2   3
     *  10|  1   3
     *     ---------
     * -10|  3   1
     * -20|  3   2
     * -30|  3   2
     *
     */
    expect(stackedSeries.map(s => s.stackedData)).toStrictEqual([
      [
        ["2020-10-18", 10, 0],
        ["2020-10-19", -10, 0],
      ],
      [
        ["2020-10-18", 30, 10],
        ["2020-10-19", -30, -10],
      ],
      [
        ["2020-10-18", -30, 0],
        ["2020-10-19", 30, 0],
      ],
    ]);
  });
});
