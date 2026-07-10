import {
  createMockColumn,
  createMockDatasetData,
} from "metabase-types/api/mocks";

import { getValue, resolveGaugeSegments } from "./utils";

describe("Visualizations > Gauge > resolveGaugeSegments", () => {
  const DATA = createMockDatasetData({
    cols: [createMockColumn({ name: "value" })],
    rows: [[50]],
  });

  it("keeps static numeric segments", () => {
    const { segments, errors } = resolveGaugeSegments(
      [{ min: 0, max: 100, color: "red", label: "range" }],
      DATA,
    );

    expect(errors).toEqual([]);
    expect(segments).toEqual([
      { min: 0, max: 100, color: "red", label: "range" },
    ]);
  });

  it("resolves a cross-question reference from referenced_cards", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_cards: {
        "9": {
          status: "completed",
          data: { cols: [createMockColumn({ name: "goal" })], rows: [[250]] },
        },
      },
    });

    const { segments, errors } = resolveGaugeSegments(
      [{ min: 0, max: { card_id: 9, column: "goal" }, color: "green" }],
      data,
    );

    expect(errors).toEqual([]);
    expect(segments).toEqual([{ min: 0, max: 250, color: "green" }]);
  });

  it("drops segments that fail to resolve and reports errors", () => {
    const data = createMockDatasetData({
      ...DATA,
      referenced_cards: { "9": { status: "failed", error: "boom" } },
    });
    const { segments, errors } = resolveGaugeSegments(
      [{ min: 0, max: { card_id: 9, column: "goal" }, color: "green" }],
      data,
    );

    expect(segments).toEqual([]);
    expect(errors).toEqual([
      { card_id: 9, column: "goal", reason: "query-failed" },
    ]);
  });
});

describe("Visualizations > Gauge > utils", () => {
  const valueTestCases = [
    [[[null]], 0],
    [[[undefined]], 0],
    [[["foo"]], 0],
    [[[""]], 0],
    [[[0]], 0],
    [[[1]], 1],
    [
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      1,
    ],
    [[3], 0],
    [[["Infinity"]], Infinity],
  ];

  valueTestCases.forEach(([input, output]) => {
    it(`should return ${output} for ${JSON.stringify(input)}`, () => {
      expect(getValue(input as unknown[][])).toEqual(output);
    });
  });
});
