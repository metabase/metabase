import { color, setColor } from "./palette";

describe("palette", () => {
  it("should get a color from the palette", () => {
    expect(color("brand")).toBeDefined();
  });

  it("should set a color in the palette", () => {
    const originalColor = color("brand");
    setColor("brand", "blue");
    const modifiedColor = color("brand");
    setColor("brand", originalColor);

    expect(modifiedColor).toEqual("blue");
  });

  it("should get a computed color", () => {
    expect(color("brand-light")).toBeDefined();
  });
});
