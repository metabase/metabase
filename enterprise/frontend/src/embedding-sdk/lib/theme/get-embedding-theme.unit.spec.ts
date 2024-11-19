import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  getEmbeddingComponentOverrides,
} from "embedding-sdk/lib/theme/default-component-theme";

import { getEmbeddingThemeOverride } from "./get-embedding-theme";

describe("Transform Embedding Theme Override", () => {
  it("should transform MetabaseTheme to EmbeddingThemeOverride", () => {
    const theme = getEmbeddingThemeOverride(
      {
        lineHeight: 1.5,
        fontSize: "2rem",
        fontFamily: "Roboto",
        colors: {
          brand: "hotpink",
          "text-primary": "yellow",
          "text-tertiary": "green",
          "background-disabled": "pink",
        },
      },
      "Roboto",
    );

    expect(theme).toEqual({
      lineHeight: 1.5,
      fontFamily: "Roboto",
      colors: {
        brand: expect.arrayContaining(["hotpink"]),
        "text-dark": expect.arrayContaining(["yellow"]),
        "text-primary": expect.arrayContaining(["yellow"]),
        "text-light": expect.arrayContaining(["green"]),
        "text-tertiary": expect.arrayContaining(["green"]),
        "background-disabled": expect.arrayContaining(["pink"]),
      },
      other: {
        fontSize: "2rem",
        ...DEFAULT_EMBEDDED_COMPONENT_THEME,
      },
      components: getEmbeddingComponentOverrides(theme.components),
    });
  });
});
