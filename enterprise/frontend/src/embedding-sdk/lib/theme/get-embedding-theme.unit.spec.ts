import { DEFAULT_EMBEDDED_COMPONENT_THEME } from "embedding-sdk/lib/theme/default-component-theme";

import { getEmbeddingThemeOverride } from "./get-embedding-theme";

describe("Transform Embedding Theme Override", () => {
  it("should transform MetabaseTheme to EmbeddingThemeOverride", () => {
    const theme = getEmbeddingThemeOverride({
      lineHeight: 1.5,
      fontSize: "2rem",
      fontFamily: "Roboto",
      colors: {
        brand: "hotpink",
        "text-dark": "yellow",
        "text-light": "green",
      },
    });

    expect(theme).toEqual({
      lineHeight: 1.5,
      fontFamily: "Roboto",
      colors: {
        brand: expect.arrayContaining(["hotpink"]),
        "text-dark": expect.arrayContaining(["yellow"]),
        "text-light": expect.arrayContaining(["green"]),
      },
      other: {
        fontSize: "2rem",
        ...DEFAULT_EMBEDDED_COMPONENT_THEME,
      },
    });
  });
});
