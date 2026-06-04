import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { hasNoResults } from "./no-results";

const pivotCols = [
  createMockColumn({ name: "CATEGORY", source: "breakout" }),
  createMockColumn({ name: "VENDOR", source: "breakout" }),
  createMockColumn({ name: "pivot-grouping", source: "breakout" }),
  createMockColumn({ name: "max", source: "aggregation" }),
];

describe("hasNoResults", () => {
  it("returns true when there are no rows", () => {
    expect(hasNoResults(createMockDatasetData({ rows: [] }))).toBe(true);
  });

  it("returns false for a non-pivot dataset with rows", () => {
    expect(
      hasNoResults(
        createMockDatasetData({
          rows: [[1]],
          cols: [createMockColumn({ name: "count" })],
        }),
      ),
    ).toBe(false);
  });

  it("returns true for a pivot whose only row is a grand total", () => {
    expect(
      hasNoResults(
        createMockDatasetData({
          rows: [[null, null, 3, null]],
          cols: pivotCols,
        }),
      ),
    ).toBe(true);
  });

  it("returns false for a pivot that has a detail row (grouping 0)", () => {
    expect(
      hasNoResults(
        createMockDatasetData({
          rows: [
            [null, null, 3, 42],
            ["Widget", "ACME", 0, 42],
          ],
          cols: pivotCols,
        }),
      ),
    ).toBe(false);
  });

  it("treats a string-typed grouping value as a number", () => {
    expect(
      hasNoResults(
        createMockDatasetData({
          rows: [["Widget", "ACME", "0", 42]],
          cols: pivotCols,
        }),
      ),
    ).toBe(false);
  });
});
