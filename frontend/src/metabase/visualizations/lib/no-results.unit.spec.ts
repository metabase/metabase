import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getNoResultsMessage, hasNoResults } from "./no-results";

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

describe("getNoResultsMessage", () => {
  it("returns the trimmed message", () => {
    expect(
      getNoResultsMessage({
        "card.no_results_message": " Check back **Monday**\n",
      }),
    ).toBe("Check back **Monday**");
  });

  it.each([
    ["missing", {}],
    ["null", { "card.no_results_message": null }],
    ["empty", { "card.no_results_message": "" }],
    ["blank", { "card.no_results_message": " \n " }],
    [
      "image-only",
      { "card.no_results_message": "![chart](https://example.com/chart.png)" },
    ],
    [
      "linked-image",
      {
        "card.no_results_message":
          "[![Logo](https://example.com/logo.png)](https://example.com)",
      },
    ],
    [
      "reference-image",
      {
        "card.no_results_message":
          "![chart][c]\n\n[c]: https://example.com/chart.png",
      },
    ],
    [
      "image-with-a-parenthesized-title",
      {
        "card.no_results_message":
          '![chart](https://example.com/chart.png "Sales (2026)")',
      },
    ],
  ])("treats a %s message as unset", (_label, settings) => {
    expect(getNoResultsMessage(settings)).toBeUndefined();
  });

  it("keeps a message that has text besides its images", () => {
    expect(
      getNoResultsMessage({
        "card.no_results_message":
          "![chart](https://example.com/chart.png) Soon",
      }),
    ).toBe("![chart](https://example.com/chart.png) Soon");
  });

  it("keeps a bracketed line that is not a link reference definition", () => {
    expect(
      getNoResultsMessage({
        "card.no_results_message": "[note]: this is text",
      }),
    ).toBe("[note]: this is text");
  });
});
