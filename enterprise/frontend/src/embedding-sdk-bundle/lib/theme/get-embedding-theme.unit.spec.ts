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
          "text-disabled": "green",
          "background-disabled": "pink",
          background: "orange",
          "background-secondary": "brown",
          "text-primary-inverse": "white",
          focus: "blue",
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
        "text-primary": expect.arrayContaining(["yellow"]),
        "text-primary": expect.arrayContaining(["yellow"]),
        "text-disabled": expect.arrayContaining(["green"]),
        "text-disabled": expect.arrayContaining(["green"]),
        background: expect.arrayContaining(["orange"]),
        "bg-primary": expect.arrayContaining(["orange"]),
        "bg-white": expect.arrayContaining(["orange"]),
        "bg-medium": expect.arrayContaining(["brown"]),
        "bg-secondary": expect.arrayContaining(["brown"]),
        "background-disabled": expect.arrayContaining(["pink"]),
        "text-primary-inverse": expect.arrayContaining(["white"]),
        white: expect.arrayContaining(["white"]),
        focus: expect.arrayContaining(["blue"]),
      },
      other: {
        fontSize: "2rem",
        ...DEFAULT_EMBEDDED_COMPONENT_THEME,
      },
      components: getEmbeddingComponentOverrides(),
    });
  });

  it("sets background-secondary to the value of background when it is unset", () => {
    const theme = getEmbeddingThemeOverride(
      { colors: { background: "green" } },
      "Roboto",
    );

    expect(theme).toEqual({
      fontFamily: "Roboto",
      colors: {
        background: expect.arrayContaining(["green"]),
        "bg-primary": expect.arrayContaining(["green"]),
        "bg-white": expect.arrayContaining(["green"]),
        "bg-medium": expect.arrayContaining(["green"]),
        "bg-secondary": expect.arrayContaining(["green"]),
      },
      other: { fontSize: "14px", ...DEFAULT_EMBEDDED_COMPONENT_THEME },
      components: getEmbeddingComponentOverrides(),
    });
  });
});
