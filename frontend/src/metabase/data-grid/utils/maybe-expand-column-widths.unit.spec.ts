import { maybeExpandColumnWidths } from "./maybe-expand-column-widths";

describe("maybeExpandColumnWidths", () => {
  it("returns the original map when minGridWidth is undefined, 0, or negative", () => {
    const original = { colA: 100, colB: 200 };

    const resultUndefined = maybeExpandColumnWidths(original, [], undefined);
    const resultZero = maybeExpandColumnWidths(original, [], 0);
    const resultNegative = maybeExpandColumnWidths(original, [], -100);

    expect(resultUndefined).toBe(original);
    expect(resultZero).toBe(original);
    expect(resultNegative).toBe(original);
  });

  it("returns the original map when current total width already meets minGridWidth", () => {
    const original = { colA: 100, colB: 150 }; // total 250

    const result = maybeExpandColumnWidths(original, [], 200);

    expect(result).toBe(original);
  });

  it("proportionally expands non-fixed columns while keeping fixed columns intact", () => {
    const original = { colA: 100, colB: 100, colC: 100 } as const;
    const minGridWidth = 400;

    /*
      total widths = 300
      fixed widths (colA) = 100
      factor = (400 - 100) / (300 - 100) = 1.5
      Expected -> colA: 100 (fixed), colB: 150, colC: 150
    */
    const expected = { colA: 100, colB: 150, colC: 150 };

    const result = maybeExpandColumnWidths(original, ["colA"], minGridWidth);

    expect(result).toEqual(expected);
  });

  it("gracefully handles the scenario where all columns are fixed", () => {
    const original = { colA: 80, colB: 120 };
    const minGridWidth = 500; // greater than total (200)

    const result = maybeExpandColumnWidths(
      original,
      ["colA", "colB"],
      minGridWidth,
    );

    expect(result).toEqual(original);
  });
});
