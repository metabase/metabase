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
