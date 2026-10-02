import { getNextSelectedColumns } from "./utils";

const COLUMNS = ["a", "b", "c", "d"];

describe("getNextSelectedColumns", () => {
  it("should add the targets to the selection in column order", () => {
    expect(
      getNextSelectedColumns({
        columns: COLUMNS,
        selectedColumns: ["c"],
        toggledColumns: ["d", "a"],
        isSelected: true,
      }),
    ).toEqual(["a", "c", "d"]);
  });

  it("should remove the targets and keep the rest of the selection", () => {
    expect(
      getNextSelectedColumns({
        columns: COLUMNS,
        selectedColumns: ["a", "b", "c"],
        toggledColumns: ["b"],
        isSelected: false,
      }),
    ).toEqual(["a", "c"]);
  });

  it("should return an empty selection when every selected column is removed", () => {
    expect(
      getNextSelectedColumns({
        columns: COLUMNS,
        selectedColumns: ["a", "b"],
        toggledColumns: ["a", "b"],
        isSelected: false,
      }),
    ).toEqual([]);
  });
});
