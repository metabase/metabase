import type { ScaleContinuousNumeric } from "d3-scale";
import { ValueFormatter } from "metabase/visualizations/shared/types/format";
import { TextMeasurer } from "metabase/visualizations/shared/types/measure-text";
import { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import { ChartFont } from "metabase/visualizations/shared/types/style";

const TICK_SPACING = 4;

const getWidthBasedTickInterval = (innerWidth: number) => innerWidth / 8;

const omitOverlappingTicks = (
  ticks: number[],
  tickFont: ChartFont,
  xScale: ScaleContinuousNumeric<number, number, never>,
  tickFormatter: ValueFormatter,
  measureText: TextMeasurer,
) => {
  if (ticks.length <= 1) {
    return ticks;
  }

  const nonOverlappingTicks = [ticks[0]];
  let nextAvailableX =
    measureText(tickFormatter(ticks[0]), tickFont) / 2 + TICK_SPACING;

  for (let i = 1; i < ticks.length; i++) {
    const currentTick = ticks[i];
    const currentTickWidth = measureText(tickFormatter(currentTick), tickFont);
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

const getMaxTickWidth = (
  scale: ScaleContinuousNumeric<number, number, never>,
  measureText: TextMeasurer,
  tickFormatter: ValueFormatter,
  tickFont: ChartFont,
) => {
  // Assume border ticks on a continuous scale are the widest
  const borderTicksWidths = scale
    .domain()
    .map(tick => measureText(tickFormatter(tick), tickFont) + TICK_SPACING);

  return Math.max(...borderTicksWidths);
};

const getMinTicksInterval = (
  scale: ScaleContinuousNumeric<number, number, never>,
  measureText: TextMeasurer,
  tickFormatter: ValueFormatter,
  tickFont: ChartFont,
  innerWidth: number,
) => {
  const maxTickWidth = getMaxTickWidth(
    scale,
    measureText,
    tickFormatter,
    tickFont,
  );
  return Math.max(maxTickWidth, getWidthBasedTickInterval(innerWidth));
};

const getEvenlySpacedTicks = (
  scale: ScaleContinuousNumeric<number, number, never>,
  ticksInterval: number,
  ticksCount: number,
) => {
  const ticks: number[] = [];

  const [startCoordinate] = scale.range();

  for (let i = 0; i < ticksCount; i++) {
    const tickCoordinate = startCoordinate + i * ticksInterval;
    const tickValue = scale.invert(tickCoordinate);
    ticks.push(tickValue);
  }

  return ticks;
};

export const getXTicks = (
  tickFont: ChartFont,
  innerWidth: number,
  xScale: ScaleContinuousNumeric<number, number, never>,
  tickFormatter: ValueFormatter,
  measureText: TextMeasurer,
  scaleType: ContinuousScaleType,
) => {
  const ticksInterval = getMinTicksInterval(
    xScale,
    measureText,
    tickFormatter,
    tickFont,
    innerWidth,
  );

  const ticksCount = Math.floor(innerWidth / ticksInterval);

  const ticks =
    scaleType === "log"
      ? getEvenlySpacedTicks(xScale, ticksInterval, ticksCount)
      : xScale.ticks(ticksCount);

  return omitOverlappingTicks(
    ticks,
    tickFont,
    xScale,
    tickFormatter,
    measureText,
  );
};
