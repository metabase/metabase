import colors, { getColorForValue, getRandomColor } from "metabase/lib/colors";

describe("getRandomColor", () => {
  it("should return a color string from the proper family", () => {
    const color = getRandomColor(colors);
    expect(Object.values(colors)).toContain(color);
  });
});

describe("getColorForValue", () => {
  it("should get a color by semantic name", () => {
    const color = getColorForValue("sum");
    expect(color).toBe(colors.accent1);
  });

  it("should respect changes in colors", () => {
    const { accent1, accent2 } = colors;

    colors.accent1 = accent2;
    const color = getColorForValue("sum");
    colors.accent1 = accent1;

    expect(color).toBe(colors.accent2);
  });
});
