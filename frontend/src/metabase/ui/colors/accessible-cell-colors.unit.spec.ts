import Color from "color";

import { getAccessibleCellColors } from "./accessible-cell-colors";

describe("getAccessibleCellColors", () => {
  it.each(["#ffffff", "#0c1c27"])(
    "keeps text above 4.5:1 across fills on %s",
    (surfaceColor) => {
      const fills = [
        "#c0df9d",
        "#8254ab",
        "#c4ebec",
        "#88bf4d",
        ...Array.from({ length: 256 }, (_, value) =>
          Color.rgb(value, value, value).hex(),
        ),
      ];
      for (const fill of fills) {
        for (const opacity of [0.25, 0.75, 1]) {
          const result = getAccessibleCellColors(
            Color(fill).alpha(opacity).string(),
            surfaceColor,
            "transparent",
          );
          expect(result).toBeDefined();
          if (!result) {
            throw new Error("Expected resolved cell colors");
          }
          expect(Color(result.color).alpha()).toBe(1);
          expect(Color(result.backgroundColor).alpha()).toBe(1);
          expect(
            Color(result.color).contrast(Color(result.backgroundColor)),
          ).toBeGreaterThanOrEqual(4.5);
          expect(
            Color(result.hoverColor).contrast(
              Color(result.hoverBackgroundColor),
            ),
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    },
  );

  it("composites translucent formatting over the actual surface", () => {
    const result = getAccessibleCellColors(
      "rgba(255, 255, 255, 0.75)",
      "#0c1c27",
      "#ffffff",
    );
    expect(result?.backgroundColor).toBe("rgb(194, 198, 201)");
    expect(Color(result?.color).luminosity()).toBeLessThan(0.1);
  });

  it("preserves readable custom theme text and translucent fills", () => {
    expect(
      getAccessibleCellColors(
        "rgba(255, 255, 255, 0.75)",
        "#ffffff",
        "#473261",
      ),
    ).toBeUndefined();
  });

  it("leaves unresolved CSS backgrounds to the theme", () => {
    expect(
      getAccessibleCellColors("var(--custom-cell-fill)", "#ffffff", "#333333"),
    ).toBeUndefined();
  });
});
