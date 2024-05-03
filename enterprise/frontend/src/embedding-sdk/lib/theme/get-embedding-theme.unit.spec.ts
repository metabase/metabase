import { getEmbeddingThemeOverride } from "./get-embedding-theme";

describe("Transform Embedding Theme Override", () => {
  it("should transform MetabaseTheme to EmbeddingThemeOverride", () => {
    const theme = getEmbeddingThemeOverride({
      lineHeight: 1.5,
      fontSize: "2rem",
      colors: {
        brand: "hotpink",
        "text-dark": "yellow",
        "text-light": "green",
      },
    });

    expect(theme.lineHeight).toBe(1.5);
    expect(theme.fontSizes?.md).toBe("2rem");
    expect(theme.colors?.["brand"]?.[0]).toBe("hotpink");
    expect(theme.colors?.["text-dark"]?.[0]).toBe("yellow");
  });
});
