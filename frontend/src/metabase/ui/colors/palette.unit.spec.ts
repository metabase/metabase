import { colors } from "./colors";
import { color } from "./palette";

describe("palette", () => {
  it("should get a color from the palette", () => {
    expect(color("brand")).toBeDefined();
  });

  it("should set a color in the palette", () => {
    const originalColor = color("brand");
    colors["brand"] = "blue";
    const modifiedColor = color("brand");
    colors["brand"] = originalColor;

    expect(modifiedColor).toEqual("blue");
  });

  it("should get a computed color", () => {
    expect(color("accent1-light")).toBeDefined();
  });
});
