import {
  DEFAULT_EMBEDDED_COMPONENT_THEME,
  getEmbeddingComponentOverrides,
} from "metabase/embedding-sdk/theme";

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

        // we should strip any explicit "undefined" values and apply default component values
        components: {
          popover: {
            zIndex: undefined,
          },
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
      components: getEmbeddingComponentOverrides(),
    });
  });
});
