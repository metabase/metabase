import React from "react";
import { XYChart, XYChartProps } from "../XYChart";

export const LineAreaBarChart = (props: XYChartProps) => {
  // const XTickComponent = isOrdinal
  //   ? (props: TickRendererProps) => (
  //       <Text
  //         {...getOrdinalXTickProps({
  //           props,
  //           tickFontSize: layout.font.size,
  //           xScaleBandwidth: xScale.bandwidth(),
  //           shouldRotate: areXTicksRotated,
  //           xTickWidth: xTicksDimensions.maxTextWidth,
  //         })}
  //       />
  //     )
  //   : undefined;

  // const distinctXValuesCount = getDistinctXValuesCount(series);
  // const areXTicksRotated = shouldRotateXTicks(
  //   distinctXValuesCount,
  //   settings.x.type,
  // );

  // TODO: set defaults
  return <XYChart {...props} />;
};
