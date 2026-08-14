import { getItemTableRowDndState } from "./BaseItemTableRow";

describe("getItemTableRowDndState", () => {
  it.each([
    {
      expected: "idle",
      isDragActive: false,
      isDragged: false,
      highlighted: false,
      hovered: false,
    },
    {
      expected: "dragged",
      isDragActive: true,
      isDragged: true,
      highlighted: false,
      hovered: false,
    },
    {
      expected: "disabled",
      isDragActive: true,
      isDragged: false,
      highlighted: false,
      hovered: false,
    },
    {
      expected: "drop-target",
      isDragActive: true,
      isDragged: false,
      highlighted: true,
      hovered: false,
    },
    {
      expected: "drop-target-hovered",
      isDragActive: true,
      isDragged: false,
      highlighted: true,
      hovered: true,
    },
  ])("should return $expected", ({ expected, ...state }) => {
    expect(getItemTableRowDndState(state)).toBe(expected);
  });

  it("should prioritize the dragged state over destination states", () => {
    expect(
      getItemTableRowDndState({
        isDragActive: true,
        isDragged: true,
        highlighted: true,
        hovered: true,
      }),
    ).toBe("dragged");
  });
});
