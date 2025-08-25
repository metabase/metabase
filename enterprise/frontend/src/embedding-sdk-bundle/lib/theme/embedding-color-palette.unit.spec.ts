import { getEmbeddingColorPalette } from "metabase/embedding-sdk/theme/embedding-color-palette";

describe("Embedding Color Palette", () => {
  it("transforms chart color overrides into accent colors", () => {
    const expected: Record<string, string> = {
      accent0: "#111",
      accent1: "#222",
      accent2: "#333",
      "accent2-light": "#444",
      accent3: "#555",
      "accent3-dark": "#666",
    };

    const palette = getEmbeddingColorPalette({
      charts: [
        expected.accent0,
        { base: expected.accent1 },
        { base: expected.accent2, tint: expected["accent2-light"] },
        { base: expected.accent3, shade: expected["accent3-dark"] },
      ],
    }) as Record<string, string>;

    for (const key in expected) {
      expect(palette[key]).toBe(expected[key]);
    }
  });
});
