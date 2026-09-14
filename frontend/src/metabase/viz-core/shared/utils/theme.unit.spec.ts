import { DEFAULT_METABASE_COMPONENT_THEME } from "metabase/ui";

import { getVisualizationTheme } from "./theme";

describe("Cartesian tick styling", () => {
  it.each([
    {
      name: "full-page chart",
      options: {},
      fontSize: 14,
      marginX: 12,
      marginY: 24,
    },
    {
      name: "dashboard card",
      options: { isDashboard: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      name: "compact preview",
      options: { isCompact: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      name: "large dashboard card",
      options: {
        isDashboard: true,
        isLargeCard: true,
      },
      fontSize: 12,
      marginX: 8,
      marginY: 16,
    },
    {
      name: "non-large dashboard card",
      options: {
        isDashboard: true,
        isLargeCard: false,
      },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      name: "full-page chart with large dimensions",
      options: {
        isLargeCard: true,
      },
      fontSize: 14,
      marginX: 12,
      marginY: 24,
    },
  ])(
    "uses the specified values for $name",
    ({ options, fontSize, marginX, marginY }) => {
      const theme = getVisualizationTheme({
        theme: DEFAULT_METABASE_COMPONENT_THEME,
        ...options,
      });

      expect(theme.cartesian.ticks).toEqual({ fontSize, marginX, marginY });
      expect(theme.cartesian.label.fontSize).toBe(13);
      expect(theme.cartesian.goalLine.label.fontSize).toBe(13);
    },
  );

  it.each([false, true])(
    "preserves explicit embedding font overrides with isDashboard=%s",
    (isDashboard) => {
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
        isDashboard,
      });

      expect(theme.cartesian.ticks.fontSize).toBe(24);
      expect(theme.cartesian.ticks.marginY).toBe(isDashboard ? 12 : 24);
    },
  );
});
