import type { ScaleContinuousNumeric } from "d3-scale";
import { BarData } from "../../RowChart/types";

export const getDataLabel = (
  bar: BarData<unknown>,
  xScale: ScaleContinuousNumeric<number, number, never>,
  seriesKey: string,
  isStacked?: boolean,
  labelledSeries?: string[] | null,
) => {
  const { xStartValue, xEndValue, isNegative } = bar;
  const value = isNegative ? xStartValue : xEndValue;

  const [xDomainStart, xDomainEnd] = xScale.domain();
  const isOutOfDomain = value <= xDomainStart || value >= xDomainEnd;

  if (isOutOfDomain) {
    return null;
  }

  const isLabelVisible =
    labelledSeries?.includes(seriesKey) && (!isStacked || bar.isBorderValue);

  return isLabelVisible ? value : null;
};
