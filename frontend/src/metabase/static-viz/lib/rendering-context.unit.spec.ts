import {
  createStaticRenderingContext,
  withCartesianChartSize,
} from "./rendering-context";
import { STATIC_CARTESIAN_CHART_SIZE } from "./utils";

describe("withCartesianChartSize", () => {
  it("sizes the default static cartesian chart as medium", () => {
    const renderingContext = withCartesianChartSize(
      createStaticRenderingContext(),
      STATIC_CARTESIAN_CHART_SIZE,
    );

    expect(renderingContext.cartesianSize).toBe("medium");
    expect(renderingContext.theme.cartesian.ticks).toEqual({
      fontSize: 12,
      marginX: 8,
      marginY: 12,
    });
    expect(renderingContext.theme.cartesian.axisTitle).toEqual({
      fontSize: 12,
      fontWeight: 700,
      marginX: 12,
      marginY: 16,
    });
  });
});
