import type { ScaleContinuousNumeric } from "d3-scale";

import type { BarData } from "../../RowChart/types";

export const getDataLabel = <TDatum>(
  bar: BarData<TDatum>,
  xScale: ScaleContinuousNumeric<number, number, never>,
  seriesKey: string,
  isStacked?: boolean,
  labelledSeries?: string[] | null,
) => {
  const { xStartValue, xEndValue, isNegative } = bar;
  const value = isNegative ? xStartValue : xEndValue;

  if (value == null) {
    return null;
  }

  const [xDomainStart, xDomainEnd] = xScale.domain();
  const isOutOfDomain = value <= xDomainStart || value >= xDomainEnd;

  if (isOutOfDomain) {
    return null;
  }

  const isLabelVisible =
    labelledSeries?.includes(seriesKey) && (!isStacked || bar.isBorderValue);

  return isLabelVisible ? value : null;
};
