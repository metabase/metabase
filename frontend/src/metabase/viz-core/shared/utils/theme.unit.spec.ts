import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";

import { DEFAULT_VISUALIZATION_THEME, getVisualizationTheme } from "./theme";

describe("Cartesian tick and axis title styling", () => {
  it.each([
    {
      cartesianSize: "small",
      ticks: { fontSize: 12, marginX: 10, marginY: 12 },
      axisTitle: { fontSize: 11, fontWeight: 700, marginX: 8, marginY: 16 },
    },
    {
      cartesianSize: "medium",
      ticks: { fontSize: 12, marginX: 10, marginY: 12 },
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 12, marginY: 16 },
    },
    {
      cartesianSize: "large",
      ticks: { fontSize: 12, marginX: 10, marginY: 16 },
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 24, marginY: 24 },
    },
    {
      cartesianSize: "fullscreen",
      ticks: { fontSize: 14, marginX: 14, marginY: 24 },
      axisTitle: { fontSize: 14, fontWeight: 700, marginX: 40, marginY: 40 },
    },
  ] as const)(
    "uses the specified values for $cartesianSize charts",
    ({ cartesianSize, ticks, axisTitle }) => {
      const theme = getVisualizationTheme({
        theme: DEFAULT_METABASE_COMPONENT_THEME,
        cartesianSize,
      });

      expect(theme.cartesian.ticks).toEqual(ticks);
      expect(theme.cartesian.axisTitle).toEqual(axisTitle);
      expect(theme.cartesian.label.fontSize).toBe(13);
      expect(theme.cartesian.goalLine.label.fontSize).toBe(13);
    },
  );

  it.each(["small", "medium", "large", "fullscreen"] as const)(
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
      expect(theme.cartesian.axisTitle.fontSize).toBe(24);
      expect(theme.cartesian.ticks.marginY).toBe(
        getVisualizationTheme({
          theme: DEFAULT_METABASE_COMPONENT_THEME,
          cartesianSize,
        }).cartesian.ticks.marginY,
      );
    },
  );

  it("keeps the unsized fallback as fullscreen", () => {
    expect(DEFAULT_VISUALIZATION_THEME.cartesian.ticks).toEqual({
      fontSize: 14,
      marginX: 14,
      marginY: 24,
    });
    expect(DEFAULT_VISUALIZATION_THEME.cartesian.axisTitle).toEqual({
      fontSize: 14,
      fontWeight: 700,
      marginX: 40,
      marginY: 40,
    });
    expect(
      DEFAULT_VISUALIZATION_THEME.cartesian.splitLine.lineStyle.color,
    ).toBe("#DCDFE0");
  });
});
