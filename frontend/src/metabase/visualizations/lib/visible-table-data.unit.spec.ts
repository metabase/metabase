import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getVisibleTableData } from "./visible-table-data";

const TEST_SERIES: RawSeries = [
  {
    card: createMockCard({ display: "table" }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "NAME", display_name: "Name" }),
        createMockColumn({ name: "TOTAL", display_name: "Total" }),
      ],
      rows: [["Widget", 10.5]],
    }),
  },
];

describe("getVisibleTableData", () => {
  it("hides every column when the table.columns setting is missing", () => {
    const { cols, rows } = getVisibleTableData({
      series: TEST_SERIES,
      settings: {},
    });

    expect(cols).toEqual([]);
    expect(rows).toEqual([[]]);
  });

  it("keeps details-only columns while honoring hidden ones when the flags split", () => {
    const series: RawSeries = [
      {
        card: createMockCard({ display: "table" }),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "NAME", display_name: "Name" }),
            createMockColumn({
              name: "DETAIL",
              display_name: "Detail",
              visibility_type: "details-only",
            }),
          ],
          rows: [["Widget", "d"]],
        }),
      },
    ];
    const settings = {
      "table.columns": [
        { name: "NAME", enabled: false },
        { name: "DETAIL", enabled: true },
      ],
    };

    const split = getVisibleTableData({
      series,
      settings,
      isShowingDetailsOnlyColumns: true,
      isShowingDisabledColumns: false,
    });
    expect(split.cols.map((col) => col.name)).toEqual(["DETAIL"]);

    const tied = getVisibleTableData({
      series,
      settings,
      isShowingDetailsOnlyColumns: true,
    });
    expect(tied.cols.map((col) => col.name)).toEqual(["NAME", "DETAIL"]);
  });

  it("keeps the results timezone when pivoting", () => {
    const series: RawSeries = [
      {
        card: createMockCard({ display: "table" }),
        data: createMockDatasetData({
          cols: [
            createMockColumn({ name: "CATEGORY", display_name: "Category" }),
            createMockColumn({ name: "VENDOR", display_name: "Vendor" }),
            createMockColumn({ name: "COUNT", display_name: "Count" }),
          ],
          rows: [["Doohickey", "Alpha", 10]],
          results_timezone: "Europe/Bucharest",
        }),
      },
    ];

    const { results_timezone } = getVisibleTableData({
      series,
      settings: {
        "table.pivot": true,
        "table.pivot_column": "VENDOR",
        "table.cell_column": "COUNT",
      },
    });

    expect(results_timezone).toBe("Europe/Bucharest");
  });
});
