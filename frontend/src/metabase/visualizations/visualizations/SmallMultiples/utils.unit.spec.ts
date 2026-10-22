import type { RawSeries } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getSmallMultiples } from "./utils";

const createSeries = (rows: (string | number | null)[][]): RawSeries => [
  {
    card: createMockCard({
      display: "small_multiples",
      visualization_settings: {
        "graph.dimensions": ["period", "state"],
        "graph.metrics": ["actors"],
      },
    }),
    data: createMockDatasetData({
      cols: [
        createMockColumn({ name: "breakout" }),
        createMockColumn({ name: "period", base_type: "type/Date" }),
        createMockColumn({ name: "state" }),
        createMockColumn({ name: "actors", base_type: "type/Integer" }),
      ],
      rows,
    }),
  },
];

describe("getSmallMultiples", () => {
  const panels = getSmallMultiples(
    createSeries([
      ["Paying", "2026-01-12", "new", 3],
      ["Paying", "2026-01-12", "dormant", -2],
      [null, "2026-01-05", "new", 5],
      [null, "2026-01-12", "new", 4],
      [null, "2026-01-19", "returning", 6],
    ]),
    "breakout",
    "bar",
  );

  it("splits the rows by the column, in the order they first appear, labeled as a legend would", () => {
    expect(panels?.map(({ label }) => label)).toEqual(["Paying", "(empty)"]);
  });

  it("gives every chart a row for every x-axis value, in order", () => {
    const [paying] = panels ?? [];

    expect(paying.series[0].data.rows).toEqual([
      ["Paying", "2026-01-05", "new", 0],
      ["Paying", "2026-01-12", "new", 3],
      ["Paying", "2026-01-12", "dormant", -2],
      ["Paying", "2026-01-19", "new", 0],
    ]);
  });
});
