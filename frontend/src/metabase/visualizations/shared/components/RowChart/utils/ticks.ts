import type { ScaleLinear } from "d3-scale";
import { ValueFormatter } from "metabase/visualizations/shared/types/format";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { ChartFont } from "metabase/visualizations/shared/types/style";

const TICK_SPACING = 16;

const getMinTickInterval = (innerWidth: number) => innerWidth / 4;

export const getXTicks = (
  ticksFont: ChartFont,
  innerWidth: number,
  xScale: ScaleLinear<number, number, never>,
  xTickFormatter: ValueFormatter,
  measureText: TextMeasurer,
) => {
  // Assume border ticks on a continuous scale are the widest
  const borderTicksWidths = xScale.domain().map(
    tick =>
      measureText(xTickFormatter(tick), {
        size: `${ticksFont.size}px`,
        weight: ticksFont.weight?.toString() ?? "400",
        family: ticksFont.family ?? "Lato",
      }) + TICK_SPACING,
  );

  const ticksInterval = Math.max(
    ...borderTicksWidths,
    getMinTickInterval(innerWidth),
  );

  const ticksCount = Math.floor(innerWidth / ticksInterval);
  return xScale.ticks(ticksCount);
};
