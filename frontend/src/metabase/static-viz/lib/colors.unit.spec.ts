import { DEFAULT_VISUALIZATION_THEME } from "metabase/viz-core";

import { createColorGetter } from "./colors";
import { replaceFunctionalColors } from "./svg";

describe("static chart axis colors", () => {
  it("uses the same opaque gray for axis lines and gridlines", () => {
    const axisColor = createColorGetter()("chart-axis");
    const gridlineColor =
      DEFAULT_VISUALIZATION_THEME.cartesian.splitLine.lineStyle.color;

    expect(axisColor).toBe("#DCDFE0");
    expect(gridlineColor).toBe(axisColor);
    expect(replaceFunctionalColors(`<path stroke="${gridlineColor}"/>`)).toBe(
      `<path stroke="${axisColor}"/>`,
    );
  });
});
