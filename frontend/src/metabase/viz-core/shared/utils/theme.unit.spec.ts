import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";

import { DEFAULT_VISUALIZATION_THEME, getVisualizationTheme } from "./theme";

describe("Cartesian tick styling", () => {
  it.each([
    { cartesianSize: "small", fontSize: 12, marginX: 8, marginY: 12 },
    { cartesianSize: "medium", fontSize: 12, marginX: 8, marginY: 16 },
    { cartesianSize: "large", fontSize: 14, marginX: 12, marginY: 24 },
  ] as const)(
    "uses the specified values for $cartesianSize charts",
    ({ cartesianSize, fontSize, marginX, marginY }) => {
      const theme = getVisualizationTheme({
        theme: DEFAULT_METABASE_COMPONENT_THEME,
        cartesianSize,
      });

      expect(theme.cartesian.ticks).toEqual({ fontSize, marginX, marginY });
      expect(theme.cartesian.label.fontSize).toBe(13);
      expect(theme.cartesian.goalLine.label.fontSize).toBe(13);
    },
  );

  it.each(["small", "medium", "large"] as const)(
    "preserves explicit embedding font overrides on %s charts",
    (cartesianSize) => {
      const theme = getVisualizationTheme({
        theme: {
          ...DEFAULT_METABASE_COMPONENT_THEME,
          hasCustomChartFontSize: true,
          fontSize: "20px",
          cartesian: {
            ...DEFAULT_METABASE_COMPONENT_THEME.cartesian,
            label: { fontSize: "1.2em" },
          },
        },
        cartesianSize,
      });

      expect(theme.cartesian.ticks.fontSize).toBe(24);
      expect(theme.cartesian.ticks.marginY).toBe(
        getVisualizationTheme({
          theme: DEFAULT_METABASE_COMPONENT_THEME,
          cartesianSize,
        }).cartesian.ticks.marginY,
      );
    },
  );

  it("keeps the existing static export defaults", () => {
    expect(DEFAULT_VISUALIZATION_THEME.cartesian.ticks).toEqual({
      fontSize: 14,
      marginX: 12,
      marginY: 24,
    });
    expect(
      DEFAULT_VISUALIZATION_THEME.cartesian.splitLine.lineStyle.color,
    ).toBe("#DCDFE0");
  });
});
