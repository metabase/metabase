import { Model, helper } from "echarts/core";
import type { YAXisOption } from "echarts/types/dist/shared";

import type { Extent } from "../../../types";

type ValueAxisOption = Extract<YAXisOption, { type?: "value" }>;

/** Lets ECharts include zero after applying boundary gaps, as native axes do. */
class ValueAxisScaleModel extends Model<ValueAxisOption> {
  needIncludeZero() {
    return !this.option.scale;
  }
}

/** Uses the final axis options so explicit ticks share ECharts' rendered scale. */
export function getResponsiveYAxisTicks(
  extent: Extent,
  axis: ValueAxisOption,
  height: number,
) {
  const scale = helper.createScale(extent, new ValueAxisScaleModel(axis));
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
