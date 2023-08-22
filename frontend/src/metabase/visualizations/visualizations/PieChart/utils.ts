import _ from "underscore";
import type {
  ComputedVisualizationSettings,
  StackedTooltipModel,
} from "metabase/visualizations/types";
import { DatasetColumn } from "metabase-types/api";
import { formatValue } from "metabase/lib/formatting";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";

export function getMaxLabelDimension(
  d3Arc: d3.svg.Arc<d3.svg.arc.Arc>,
  slice: d3.svg.arc.Arc,
) {
  // Invalid typing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const innerRadius = d3Arc.innerRadius()();
  // Invalid typing
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const outerRadius = d3Arc.outerRadius()();
  const donutWidth = outerRadius - innerRadius;

  const arcAngle = slice.startAngle - slice.endAngle;

  // using law of cosines to calculate the arc length
  // c = sqrt(a^2 + b^2﹣2*a*b * cos(arcAngle))
  // where a = b = innerRadius

  const innerRadiusArcDistance = Math.sqrt(
    2 * innerRadius * innerRadius -
      2 * innerRadius * innerRadius * Math.cos(arcAngle),
  );

  return Math.min(innerRadiusArcDistance, donutWidth);
}

interface SliceData {
  key: string;
  value: number;
  color: string;
}

export const getTooltipModel = (
  slices: SliceData[],
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

export function formatPercent({
  percent,
  decimals,
  settings,
  cols,
}: {
  percent: number;
  decimals: number;
  settings: ComputedVisualizationSettings;
  cols: DatasetColumn[];
}) {
  const metricIndex = settings["pie._metricIndex"];

  return formatValue(percent, {
    column: cols[metricIndex],
    // TODO fix type error
    number_separators: settings.column?.(cols[metricIndex]).number_separators,
    jsx: true,
    majorWidth: 0,
    number_style: "percent",
    decimals,
  });
}

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
