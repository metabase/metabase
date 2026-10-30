import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { pivotCohorts, toTooltipColumns } from "./utils";

const DATA = createMockDatasetData({
  cols: ["cohort", "offset", "cohort_size", "value", "avg_events"].map((name) =>
    createMockColumn({ name }),
  ),
  rows: [
    ["2024-01-01", 0, 10, 1, 3.25],
    ["2024-01-01", 1, 10, 0.5, null],
  ],
});

describe("pivotCohorts", () => {
  it("gives each cell its tooltip lines, leaving out missing values", () => {
    const [cohort] = pivotCohorts(DATA, [
      { name: "avg_events", title: "Events per returning person" },
    ]);

    expect(cohort.details.get(0)).toEqual([
      { title: "Events per returning person", value: 3.25 },
    ]);
    expect(cohort.details.get(1)).toEqual([]);
  });

  it("has no tooltip lines without tooltip columns", () => {
    const [cohort] = pivotCohorts(DATA);

    expect(cohort.details.get(0)).toEqual([]);
  });
});

describe("toTooltipColumns", () => {
  it("keeps only well-formed columns", () => {
    expect(
      toTooltipColumns([
        { name: "avg_events", title: "Events" },
        { name: "avg_sessions" },
        "avg_sessions",
      ]),
    ).toEqual([{ name: "avg_events", title: "Events" }]);
    expect(toTooltipColumns(undefined)).toEqual([]);
  });
});
