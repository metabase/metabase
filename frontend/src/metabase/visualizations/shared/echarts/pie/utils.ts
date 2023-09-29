import _ from "underscore";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";
import type { StackedTooltipModel } from "metabase/visualizations/types";
import type { PieSlice } from "metabase/visualizations/shared/echarts/pie/types";

export function computeLegendDecimals({
  percentages,
}: {
  percentages: number[];
}) {
  return computeMaxDecimalsForValues(percentages, {
    style: "percent",
    maximumSignificantDigits: 3,
  });
}

export function computeLabelDecimals({
  percentages,
}: {
  percentages: number[];
}) {
  return computeMaxDecimalsForValues(percentages, {
    style: "percent",
    maximumSignificantDigits: 2,
  });
}

export const getTooltipModel = (
  slices: PieSlice[],
  hoveredIndex: number | null,
  dimensionColumnName: string,
  dimensionFormatter: (value: unknown) => string,
  metricFormatter: (value: unknown) => string,
  grandTotal?: number,
): StackedTooltipModel => {
  const rows = slices.map(slice => ({
    name: dimensionFormatter(slice.key),
    value: slice.value,
    color: slice.color,
    formatter: metricFormatter,
  }));

  const [headerRows, bodyRows] = _.partition(
    rows,
    (_, index) => index === hoveredIndex,
  );

  return {
    headerTitle: dimensionColumnName,
    headerRows,
    bodyRows,
    totalFormatter: metricFormatter,
    grandTotal,
    showTotal: true,
    showPercentages: true,
  };
};
