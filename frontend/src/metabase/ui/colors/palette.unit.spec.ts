import { colors } from "./colors";
import { color } from "./palette";

describe("palette", () => {
  it("should get a color from the palette", () => {
    expect(color("core-brand")).toBeDefined();
  });

  it("should set a color in the palette", () => {
    const originalColor = color("core-brand");
    colors["core-brand"] = "blue";
    const modifiedColor = color("core-brand");
    colors["core-brand"] = originalColor;

    expect(modifiedColor).toEqual("blue");
  });

  it("should get a computed color", () => {
    expect(color("accent1-light")).toBeDefined();
  });
});
