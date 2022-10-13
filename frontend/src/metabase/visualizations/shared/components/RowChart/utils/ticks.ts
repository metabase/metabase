import type { ScaleLinear } from "d3-scale";
import { ValueFormatter } from "metabase/visualizations/shared/types/format";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { ChartFont } from "metabase/visualizations/shared/types/style";

const TICK_SPACING = 4;

const getMinTickInterval = (innerWidth: number) => innerWidth / 4;

const omitOverlappingTicks = (
  ticks: number[],
  ticksFont: ChartFont,
  xScale: ScaleLinear<number, number, never>,
  xTickFormatter: ValueFormatter,
  measureText: TextMeasurer,
) => {
  if (ticks.length <= 1) {
    return ticks;
  }

  const nonOverlappingTicks = [ticks[0]];
  let nextAvailableX =
    measureText(xTickFormatter(ticks[0]), ticksFont) / 2 + TICK_SPACING;

  for (let i = 1; i < ticks.length; i++) {
    const currentTick = ticks[i];
    const currentTickWidth = measureText(
      xTickFormatter(currentTick),
      ticksFont,
    );
    const currentTickX = xScale(currentTick);
    const currentTickStart = currentTickX - currentTickWidth / 2;

    if (currentTickStart < nextAvailableX) {
      continue;
    }

    nonOverlappingTicks.push(currentTick);
    nextAvailableX = currentTickX + currentTickWidth / 2 + TICK_SPACING;
  }

  return nonOverlappingTicks;
};

export const getXTicks = (
  ticksFont: ChartFont,
  innerWidth: number,
  xScale: ScaleLinear<number, number, never>,
  xTickFormatter: ValueFormatter,
  measureText: TextMeasurer,
) => {
  // Assume border ticks on a continuous scale are the widest
  const borderTicksWidths = xScale
    .domain()
    .map(tick => measureText(xTickFormatter(tick), ticksFont) + TICK_SPACING);

  const ticksInterval = Math.max(
    ...borderTicksWidths,
    getMinTickInterval(innerWidth),
  );

  const ticksCount = Math.floor(innerWidth / ticksInterval);
  const ticks = xScale.ticks(ticksCount);

  return omitOverlappingTicks(
    ticks,
    ticksFont,
    xScale,
    xTickFormatter,
    measureText,
  );
};
