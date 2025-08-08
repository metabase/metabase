import { applyColorOperation } from "./dynamic-css-vars";

describe("applyColorOperation", () => {
  it("should apply lighten operation correctly", () => {
    const baseColor = "#ff0000"; // Red
    const operation = { source: "brand", lighten: 0.2 };

    const result = applyColorOperation(baseColor, operation);

    // Lightening red should make it different and be a valid color format
    expect(result).not.toBe(baseColor);
    expect(result).toMatch(/^(#[0-9a-fA-F]{6}|hsl\(|rgb\()/); // Valid color format
  });

  it("should apply darken operation correctly", () => {
    const baseColor = "#ff0000"; // Red
    const operation = { source: "brand", darken: 0.2 };

    const result = applyColorOperation(baseColor, operation);

    // Darkening red should make it different and be a valid color format
    expect(result).not.toBe(baseColor);
    expect(result).toMatch(/^(#[0-9a-fA-F]{6}|hsl\(|rgb\()/); // Valid color format
  });

  it("should apply alpha operation correctly", () => {
    const baseColor = "#ff0000"; // Red
    const operation = { source: "brand", alpha: 0.5 };

    const result = applyColorOperation(baseColor, operation);

    // Alpha should return a color with alpha channel
    expect(result).toMatch(/^(rgba?\(|hsla\()/);
    expect(result).toContain("0.5"); // Should contain the alpha value
  });

  it("should apply multiple operations in sequence", () => {
    const baseColor = "#0066cc"; // Blue
    const operation = { source: "brand", lighten: 0.1, alpha: 0.8 };

    const result = applyColorOperation(baseColor, operation);

    // Should be a color with alpha channel
    expect(result).toMatch(/^(rgba?\(|hsla\()/);
    expect(result).toContain("0.8");
  });

  it("should return the base color when no operations are provided", () => {
    const baseColor = "#00ff00"; // Green
    const operation = { source: "brand" }; // No operations

    const result = applyColorOperation(baseColor, operation);

    expect(result).toBe(baseColor);
  });

  it("should handle all operations together", () => {
    const baseColor = "#333333"; // Dark gray
    const operation = {
      source: "brand",
      lighten: 0.3,
      darken: 0.1,
      alpha: 0.7,
    };

    const result = applyColorOperation(baseColor, operation);

    // Should be a color with alpha channel
    expect(result).toMatch(/^(rgba?\(|hsla\()/);
    expect(result).toContain("0.7");
  });
});
