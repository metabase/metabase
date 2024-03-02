import type { ScaleContinuousNumeric } from "d3-scale";
import _ from "underscore";

import type { ValueFormatter } from "metabase/visualizations/shared/types/format";
import type { TextWidthMeasurer } from "metabase/visualizations/shared/types/measure-text";
import type { ContinuousScaleType } from "metabase/visualizations/shared/types/scale";
import type { ChartFont } from "metabase/visualizations/shared/types/style";

const TICK_SPACING = 20;

const getWidthBasedTickInterval = (innerWidth: number) => innerWidth / 12;

const omitOverlappingTicks = (
  ticks: number[],
  tickFont: ChartFont,
  xScale: ScaleContinuousNumeric<number, number, never>,
  tickFormatter: ValueFormatter,
  measureTextWidth: TextWidthMeasurer,
) => {
  if (ticks.length <= 1) {
    return ticks;
  }

  const [_min, max] = xScale.range();

  const nonOverlappingTicks: number[] = [];
  let nextAvailableX = Infinity;

  for (let i = ticks.length - 1; i >= 0; i--) {
    const currentTick = ticks[i];
    const currentTickWidth = measureTextWidth(
      tickFormatter(currentTick),
      tickFont,
    );
    const currentTickX = xScale(currentTick);

    const currentTickEnd = currentTickX + currentTickWidth / 2;
    const currentTickStart = currentTickX - currentTickWidth / 2;

    if (currentTickEnd > nextAvailableX || currentTickEnd > max) {
      continue;
    }

    nonOverlappingTicks.push(currentTick);
    nextAvailableX = currentTickStart + TICK_SPACING;
  }

  nonOverlappingTicks.sort((a, b) => a - b);
  return nonOverlappingTicks;
};

const getMaxTickWidth = (
  scale: ScaleContinuousNumeric<number, number, never>,
  measureTextWidth: TextWidthMeasurer,
  tickFormatter: ValueFormatter,
  tickFont: ChartFont,
) => {
  // Assume border ticks on a continuous scale are the widest
  const borderTicksWidths = scale
    .domain()
    .map(
      tick => measureTextWidth(tickFormatter(tick), tickFont) + TICK_SPACING,
    );

  return Math.max(...borderTicksWidths);
};

const getMinTicksInterval = (
  scale: ScaleContinuousNumeric<number, number, never>,
  measureText: TextWidthMeasurer,
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
  const [startCoordinate] = scale.range();

  return _.range(ticksCount).map(i => {
    const tickCoordinate = startCoordinate + i * ticksInterval;
    return scale.invert(tickCoordinate);
  });
};

const getLimitedCountAutoTicks = (
  scale: ScaleContinuousNumeric<number, number, never>,
  countLimit: number,
) => {
  let suggestedCount = countLimit;
  while (suggestedCount > 0) {
    const ticks = scale.ticks(suggestedCount);

    if (ticks.length <= countLimit) {
      return ticks;
    }

    suggestedCount--;
  }

  return [];
};

export const getXTicks = (
  tickFont: ChartFont,
  innerWidth: number,
  xScale: ScaleContinuousNumeric<number, number, never>,
  tickFormatter: ValueFormatter,
  measureTextWidth: TextWidthMeasurer,
  scaleType: ContinuousScaleType,
) => {
  const ticksInterval = getMinTicksInterval(
    xScale,
    measureTextWidth,
    tickFormatter,
    tickFont,
    innerWidth,
  );

  const ticksCount = Math.floor(innerWidth / ticksInterval);

  const ticks =
    scaleType !== "linear"
      ? getEvenlySpacedTicks(xScale, ticksInterval, ticksCount)
      : getLimitedCountAutoTicks(xScale, ticksCount);

  return omitOverlappingTicks(
    ticks,
    tickFont,
    xScale,
    tickFormatter,
    measureTextWidth,
  );
};
