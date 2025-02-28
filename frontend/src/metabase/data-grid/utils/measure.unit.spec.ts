import { pickRowsToMeasure } from "./measure";

describe("pickRowsToMeasure", () => {
  const createData = (values: (string | null | undefined)[]) =>
    values.map(value => ({ value }));

  const accessorFn = (row: { value: string | null | undefined }) => row.value;

  it("should return an empty array for empty data", () => {
    const data: { value: string | null | undefined }[] = [];
    const result = pickRowsToMeasure(data, accessorFn);

    expect(result).toEqual([]);
  });

  it("should return an empty array if all rows have null or undefined values", () => {
    const data = createData([null, undefined, null]);
    const result = pickRowsToMeasure(data, accessorFn);

    expect(result).toEqual([]);
  });

  it("should return indexes of rows with non-null values", () => {
    const data = createData(["a", null, "b", undefined, "c"]);
    const result = pickRowsToMeasure(data, accessorFn);

    expect(result).toEqual([0, 2, 4]);
  });

  it("should return only up to count indexes", () => {
    const data = createData(["a", "b", "c", "d", "e", "f"]);
    const result = pickRowsToMeasure(data, accessorFn, 3);

    expect(result).toEqual([0, 1, 2]);
  });

  it("should handle default count of 10", () => {
    const values = Array.from({ length: 15 }, (_, i) => `value-${i}`);
    const data = createData(values);
    const result = pickRowsToMeasure(data, accessorFn);

    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("should limit results to specified count", () => {
    const data = createData([
      null,
      "a",
      null,
      "b",
      "c",
      null,
      "d",
      "e",
      "f",
      null,
      "g",
      "h",
      "i",
      "j",
      "k",
    ]);
    const result = pickRowsToMeasure(data, accessorFn, 5);

    expect(result).toEqual([1, 3, 4, 6, 7]);
  });
});
