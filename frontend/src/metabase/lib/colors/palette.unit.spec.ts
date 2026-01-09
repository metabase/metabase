import { colors } from "./colors";
import {
  alpha,
  color,
  darken,
  getTextColorForBackground,
  isDark,
  isLight,
  lighten,
  shade,
  tint,
} from "./palette";

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
    expect(color("brand-light")).toBeDefined();
  });
});

describe("isDark with edge cases", () => {
  it("should handle valid dark colors", () => {
    expect(isDark("#000000")).toBe(true);
    expect(isDark("rgba(50, 50, 50, 0.75)")).toBe(true);
  });

  it("should handle valid light colors", () => {
    expect(isDark("#FFFFFF")).toBe(false);
    expect(isDark("rgba(255, 255, 255, 0.75)")).toBe(false);
  });

  it("should not crash with scientific notation in colors", () => {
    expect(() => isDark("rgba(136, 191, 77, 7.5e-7)")).not.toThrow();
  });

  it("should default to false (light) for unparseable colors", () => {
    expect(isDark("invalid-color-string")).toBe(false);
    expect(isDark("not-a-color")).toBe(false);
  });

  it("should handle empty string gracefully", () => {
    expect(isDark("")).toBe(false);
  });
});

describe("isLight with edge cases", () => {
  it("should handle valid light colors", () => {
    expect(isLight("#FFFFFF")).toBe(true);
    expect(isLight("rgba(255, 255, 255, 0.75)")).toBe(true);
  });

  it("should handle valid dark colors", () => {
    expect(isLight("#000000")).toBe(false);
    expect(isLight("rgba(50, 50, 50, 0.75)")).toBe(false);
  });

  it("should not crash with scientific notation in colors", () => {
    expect(() => isLight("rgba(136, 191, 77, 7.5e-7)")).not.toThrow();
  });

  it("should default to true for unparseable colors", () => {
    expect(isLight("invalid-color-string")).toBe(true);
    expect(isLight("not-a-color")).toBe(true);
  });
});

describe("alpha with edge cases", () => {
  it("should handle valid colors", () => {
    const result = alpha("#FF0000", 0.5);
    expect(result).toContain("rgba");
  });

  it("should return original string for unparseable colors", () => {
    expect(alpha("invalid-color", 0.5)).toBe("invalid-color");
    expect(alpha("not-a-color", 0.75)).toBe("not-a-color");
  });

  it("should not crash with malformed input", () => {
    expect(() => alpha("", 0.5)).not.toThrow();
  });
});

describe("lighten with edge cases", () => {
  it("should handle valid colors", () => {
    const result = lighten("#000000", 0.5);
    expect(result).toBeDefined();
    expect(result).not.toBe("#000000");
  });

  it("should return original string for unparseable colors", () => {
    expect(lighten("invalid-color", 0.5)).toBe("invalid-color");
  });

  it("should not crash with malformed input", () => {
    expect(() => lighten("rgba(136, 191, 77, 7.5e-7)", 0.3)).not.toThrow();
  });
});

describe("darken with edge cases", () => {
  it("should handle valid colors", () => {
    const result = darken("#FFFFFF", 0.25);
    expect(result).toBeDefined();
    expect(result).not.toBe("#FFFFFF");
  });

  it("should return original string for unparseable colors", () => {
    expect(darken("invalid-color", 0.25)).toBe("invalid-color");
  });

  it("should not crash with malformed input", () => {
    expect(() => darken("rgba(136, 191, 77, 7.5e-7)", 0.2)).not.toThrow();
  });
});

describe("tint with edge cases", () => {
  it("should handle valid colors", () => {
    const result = tint("#FF0000", 0.125);
    expect(result).toBeDefined();
    expect(result.startsWith("#")).toBe(true);
  });

  it("should return original string for unparseable colors", () => {
    expect(tint("invalid-color", 0.125)).toBe("invalid-color");
  });

  it("should not crash with malformed input", () => {
    expect(() => tint("rgba(136, 191, 77, 7.5e-7)", 0.125)).not.toThrow();
  });
});

describe("shade with edge cases", () => {
  it("should handle valid colors", () => {
    const result = shade("#FF0000", 0.125);
    expect(result).toBeDefined();
    expect(result.startsWith("#")).toBe(true);
  });

  it("should return original string for unparseable colors", () => {
    expect(shade("invalid-color", 0.125)).toBe("invalid-color");
  });

  it("should not crash with malformed input", () => {
    expect(() => shade("rgba(136, 191, 77, 7.5e-7)", 0.125)).not.toThrow();
  });
});

describe("getTextColorForBackground with edge cases", () => {
  it("should return appropriate text color for light backgrounds", () => {
    const result = getTextColorForBackground("#FFFFFF");
    expect(result).toBeDefined();
  });

  it("should return appropriate text color for dark backgrounds", () => {
    const result = getTextColorForBackground("#000000");
    expect(result).toBeDefined();
  });

  it("should not crash with invalid background color", () => {
    expect(() => getTextColorForBackground("invalid-color")).not.toThrow();
  });

  it("should default to dark text for unparseable colors", () => {
    const result = getTextColorForBackground("not-a-color");
    expect(result).toBe(color("text-primary"));
  });

  it("should not crash with scientific notation colors", () => {
    expect(() =>
      getTextColorForBackground("rgba(136, 191, 77, 7.5e-7)"),
    ).not.toThrow();
  });
});
