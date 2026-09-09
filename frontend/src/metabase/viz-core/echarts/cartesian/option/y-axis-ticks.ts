import { helper } from "echarts/core";
import type { YAXisOption } from "echarts/types/dist/shared";

import type { Extent } from "../../../types";

/** Uses the final axis options so explicit ticks share ECharts' rendered scale. */
export function getResponsiveYAxisTicks(
  extent: Extent,
  axis: Extract<YAXisOption, { type?: "value" }>,
  height: number,
) {
  const domain: Extent = axis.scale
    ? extent
    : [Math.min(0, extent[0]), Math.max(0, extent[1])];
  const scale = helper.createScale(domain, axis);
  const [min, max] = scale.getExtent();
  const segments = height < 300 ? 2 : 4;
  const gridlines = Array.from({ length: segments + 1 }, (_, index) =>
    index === segments ? max : min + ((max - min) * index) / segments,
  );
  const labelInterval = height < 200 || (height >= 300 && height < 400) ? 2 : 1;

  return {
    ...axis,
    axisTick: { ...axis.axisTick, customValues: gridlines },
    axisLabel: {
      ...axis.axisLabel,
      customValues: gridlines.filter((_, index) => index % labelInterval === 0),
    },
    minorSplitLine: { ...axis.minorSplitLine, show: false },
  };
}
