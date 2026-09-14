import { renderHookWithProviders } from "__support__/ui";

import { useBrowserRenderingContext } from "./use-browser-rendering-context";

type RenderingOptions = Parameters<typeof useBrowserRenderingContext>[0];

function setup(options: Partial<RenderingOptions> = {}) {
  return renderHookWithProviders(useBrowserRenderingContext, {
    initialProps: { fontFamily: "Lato", ...options },
  });
}

describe("useBrowserRenderingContext", () => {
  it.each([
    {
      context: "full-page charts",
      options: {},
      fontSize: 14,
      marginX: 12,
      marginY: 24,
    },
    {
      context: "dashcards",
      options: { isDashboard: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      context: "full-page charts with the fullscreen flag",
      options: { isFullscreen: true },
      fontSize: 14,
      marginX: 12,
      marginY: 24,
    },
    {
      context: "dashboard presentation mode",
      options: { isDashboard: true, isFullscreen: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      context: "compact metric previews",
      options: { isCompact: true },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      context: "wide short cards",
      options: {
        isDashboard: true,
        dashboardCardSize: { width: 900, height: 359 },
      },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
    {
      context: "narrow tall cards",
      options: {
        isDashboard: true,
        dashboardCardSize: { width: 639, height: 600 },
      },
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    },
  ])(
    "uses tick styling for $context",
    ({ options, fontSize, marginX, marginY }) => {
      const { result } = setup(options);

      expect(result.current.theme.cartesian.ticks).toEqual({
        fontSize,
        marginX,
        marginY,
      });
      expect(result.current.theme.cartesian.label.fontSize).toBe(13);
    },
  );

  it("updates the tick gap when a dashcard crosses the large-card threshold", () => {
    const { result, rerender } = setup({
      isDashboard: true,
      dashboardCardSize: { width: 639, height: 360 },
    });

    expect(result.current.theme.cartesian.ticks.marginY).toBe(12);

    rerender({
      fontFamily: "Lato",
      isDashboard: true,
      dashboardCardSize: { width: 640, height: 360 },
    });

    expect(result.current.theme.cartesian.ticks).toEqual({
      fontSize: 12,
      marginX: 8,
      marginY: 16,
    });

    rerender({
      fontFamily: "Lato",
      isDashboard: true,
      dashboardCardSize: { width: 640, height: 359 },
    });

    expect(result.current.theme.cartesian.ticks.marginY).toBe(12);
  });

  it.each([
    {
      context: "large dashcards",
      options: { isDashboard: true },
      before: { width: 640, height: 360 },
      after: { width: 700, height: 400 },
    },
    {
      context: "small dashcards",
      options: { isDashboard: true },
      before: { width: 300, height: 200 },
      after: { width: 600, height: 350 },
    },
    {
      context: "full-page charts",
      options: {},
      before: { width: 300, height: 200 },
      after: { width: 1000, height: 800 },
    },
  ])(
    "reuses the rendering context when $context resize within the same style",
    ({ options, before, after }) => {
      const { result, rerender } = setup({
        ...options,
        dashboardCardSize: before,
      });
      const previousContext = result.current;

      rerender({ fontFamily: "Lato", ...options, dashboardCardSize: after });

      expect(result.current).toBe(previousContext);
    },
  );
});
