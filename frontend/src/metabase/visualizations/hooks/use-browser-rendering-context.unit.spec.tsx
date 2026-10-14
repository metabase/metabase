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
      width: 0,
      height: 0,
      size: "small",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 11, fontWeight: 700, marginX: 8, marginY: 16 },
    },
    {
      width: 299,
      height: 700,
      size: "small",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 11, fontWeight: 700, marginX: 8, marginY: 16 },
    },
    {
      width: 1100,
      height: 199,
      size: "small",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 11, fontWeight: 700, marginX: 8, marginY: 16 },
    },
    {
      width: 300,
      height: 200,
      size: "medium",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 12, marginY: 16 },
    },
    {
      width: 639,
      height: 700,
      size: "medium",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 12, marginY: 16 },
    },
    {
      width: 1100,
      height: 359,
      size: "medium",
      fontSize: 12,
      marginX: 10,
      marginY: 12,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 12, marginY: 16 },
    },
    {
      width: 640,
      height: 360,
      size: "large",
      fontSize: 12,
      marginX: 10,
      marginY: 16,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 24, marginY: 24 },
    },
    {
      width: 899,
      height: 700,
      size: "large",
      fontSize: 12,
      marginX: 10,
      marginY: 16,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 24, marginY: 24 },
    },
    {
      width: 1100,
      height: 479,
      size: "large",
      fontSize: 12,
      marginX: 10,
      marginY: 16,
      axisTitle: { fontSize: 12, fontWeight: 700, marginX: 24, marginY: 24 },
    },
    {
      width: 900,
      height: 480,
      size: "fullscreen",
      fontSize: 14,
      marginX: 14,
      marginY: 24,
      axisTitle: { fontSize: 14, fontWeight: 700, marginX: 40, marginY: 40 },
    },
    {
      width: 1270,
      height: 486,
      size: "fullscreen",
      fontSize: 14,
      marginX: 14,
      marginY: 24,
      axisTitle: { fontSize: 14, fontWeight: 700, marginX: 40, marginY: 40 },
    },
  ])(
    "uses $size styling for a $width by $height container",
    ({ width, height, size, fontSize, marginX, marginY, axisTitle }) => {
      const { result } = setup({ containerSize: { width, height } });

      expect(result.current.cartesianSize).toBe(size);
      expect(result.current.theme.cartesian.ticks).toEqual({
        fontSize,
        marginX,
        marginY,
      });
      expect(result.current.theme.cartesian.axisTitle).toEqual(axisTitle);
      expect(result.current.theme.cartesian.label.fontSize).toBe(13);
    },
  );

  it.each([false, true])(
    "uses the same size policy with isDashboard=%s",
    (isDashboard) => {
      const { result } = setup({
        isDashboard,
        containerSize: { width: 800, height: 400 },
      });

      expect(result.current.cartesianSize).toBe("large");
      expect(result.current.theme.cartesian.ticks).toEqual({
        fontSize: 12,
        marginX: 10,
        marginY: 16,
      });
    },
  );

  it("keeps the default rendering style when dimensions are not supplied", () => {
    const { result } = setup();

    expect(result.current.cartesianSize).toBe("fullscreen");
    expect(result.current.theme.cartesian.ticks).toEqual({
      fontSize: 14,
      marginX: 14,
      marginY: 24,
    });
  });

  it("updates presentation when either dimension crosses a breakpoint", () => {
    const { result, rerender } = setup({
      containerSize: { width: 639, height: 480 },
    });

    expect(result.current.cartesianSize).toBe("medium");

    rerender({
      fontFamily: "Lato",
      containerSize: { width: 640, height: 480 },
    });
    expect(result.current.cartesianSize).toBe("large");
    expect(result.current.theme.cartesian.ticks.marginY).toBe(16);

    rerender({
      fontFamily: "Lato",
      containerSize: { width: 900, height: 480 },
    });
    expect(result.current.cartesianSize).toBe("fullscreen");
    expect(result.current.theme.cartesian.ticks.fontSize).toBe(14);

    rerender({
      fontFamily: "Lato",
      containerSize: { width: 900, height: 479 },
    });
    expect(result.current.cartesianSize).toBe("large");
    expect(result.current.theme.cartesian.ticks.fontSize).toBe(12);
  });

  it.each([
    {
      size: "small",
      before: { width: 100, height: 100 },
      after: { width: 250, height: 180 },
    },
    {
      size: "medium",
      before: { width: 300, height: 200 },
      after: { width: 600, height: 350 },
    },
    {
      size: "large",
      before: { width: 640, height: 360 },
      after: { width: 890, height: 470 },
    },
    {
      size: "fullscreen",
      before: { width: 900, height: 480 },
      after: { width: 1500, height: 900 },
    },
  ])(
    "reuses the context while resizing within the $size tier",
    ({ before, after }) => {
      const { result, rerender } = setup({ containerSize: before });
      const previousContext = result.current;

      rerender({ fontFamily: "Lato", containerSize: after });

      expect(result.current).toBe(previousContext);
    },
  );
});
