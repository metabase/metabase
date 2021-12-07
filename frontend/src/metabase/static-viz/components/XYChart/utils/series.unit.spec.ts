import { sortSeries } from "./series";

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
