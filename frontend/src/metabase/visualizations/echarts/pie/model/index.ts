import Color from "color";
import { pie } from "d3";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { checkNotNull } from "metabase/lib/types";
import { pieNegativesWarning } from "metabase/visualizations/lib/warnings";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries, RowValue } from "metabase-types/api";

import type { ShowWarning } from "../../types";
import { OTHER_SLICE_MIN_PERCENTAGE, OTHER_SLICE_KEY } from "../constants";

import type {
  PieColumnDescriptors,
  PieChartModel,
  PieSliceData,
} from "./types";

function getColDescs(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): PieColumnDescriptors {
  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const dimension = findWithIndex(
    cols,
    c => c.name === settings["pie.dimension"],
  );
  const metric = findWithIndex(cols, c => c.name === settings["pie.metric"]);

  if (!dimension.item || !metric.item) {
    throw new Error(
      `Could not find columns based on "pie.dimension" (${settings["pie.dimension"]}) and "pie.metric" (${settings["pie.metric"]}) settings.`,
    );
  }

  return {
    dimensionDesc: {
      index: dimension.index,
      column: dimension.item,
    },
    metricDesc: {
      index: metric.index,
      column: metric.item,
    },
  };
}

export function getRowValues(row: RowValue[], colDescs: PieColumnDescriptors) {
  const { dimensionDesc, metricDesc } = colDescs;

  const dimensionValue = row[dimensionDesc.index];

  const metricValue = row[metricDesc.index] ?? 0;
  if (typeof metricValue !== "number") {
    throw new Error(
      `Pie chart metric value (${metricValue}) should be a number`,
    );
  }

  return { dimensionValue, metricValue };
}

export function getPieChartModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): PieChartModel {
  const [
    {
      data: { rows },
    },
  ] = rawSeries;
  const colDescs = getColDescs(rawSeries, settings);

  // We allow negative values if every single metric value is negative or 0
  // (`isNonPositive` = true). If the values are mixed between positives and
  // negatives, we'll simply ignore the negatives in all calculations.
  const isNonPositive = rows.every(
    row => getRowValues(row, colDescs).metricValue <= 0,
  );

  const total = rows.reduce((currTotal, row) => {
    const metricValue = getRowValues(row, colDescs).metricValue;
    if (!isNonPositive && metricValue < 0) {
      showWarning?.(pieNegativesWarning().text);
      return currTotal;
    }

    return currTotal + metricValue;
  }, 0);

  const [slices, others] = _.chain(rows)
    .map((row, index): PieSliceData => {
      const { dimensionValue, metricValue } = getRowValues(row, colDescs);

      if (!settings["pie.colors"]) {
        throw Error("missing `pie.colors` setting");
      }
      // older viz settings can have hsl values that need to be converted since
      // batik does not support hsl
      const color = Color(settings["pie.colors"][String(dimensionValue)]).hex();

      let key: string | number;
      if (dimensionValue == null) {
        key = NULL_DISPLAY_VALUE;
      } else if (typeof dimensionValue === "boolean") {
        key = String(dimensionValue);
      } else {
        key = dimensionValue;
      }

      return {
        key,
        value: isNonPositive ? -1 * metricValue : metricValue,
        displayValue: metricValue,
        normalizedPercentage: metricValue / total, // slice percentage values are normalized to 0-1 scale
        rowIndex: index,
        color,
        isOther: false,
        noHover: false,
        includeInLegend: true,
      };
    })
    .filter(slice => isNonPositive || slice.value >= 0)
    .partition(
      slice =>
        slice != null &&
        slice.normalizedPercentage >=
          (settings["pie.slice_threshold"] ?? 0) / 100, // stored setting for "pie.slice_threshold" is on 0-100 scale to match user input
    )
    .value();

  // We don't show the grey other slice if there isn't more than one slice to
  // group into it
  if (others.length === 1) {
    const singleOtherSlice = others.pop();
    slices.push(checkNotNull(singleOtherSlice));
  }

  // Only add "other" slice if there are slices below threshold with non-zero total
  const otherTotal = others.reduce((currTotal, o) => currTotal + o.value, 0);
  if (otherTotal > 0) {
    slices.push({
      key: OTHER_SLICE_KEY,
      value: otherTotal,
      displayValue: otherTotal,
      normalizedPercentage: otherTotal / total,
      color: renderingContext.getColor("text-light"),
      isOther: true,
      noHover: false,
      includeInLegend: true,
    });
  }

  slices.forEach(slice => {
    // We increase the size of small slices, otherwise they will not be visible
    // in echarts due to the border rendering over the tiny slice
    if (slice.normalizedPercentage < OTHER_SLICE_MIN_PERCENTAGE) {
      slice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
    }
  });

  // If there are no non-zero slices, we'll display a single "other" slice
  if (slices.length === 0) {
    slices.push({
      key: OTHER_SLICE_KEY,
      value: 1,
      displayValue: 0,
      normalizedPercentage: 0,
      color: renderingContext.getColor("text-light"),
      isOther: true,
      noHover: true,
      includeInLegend: false,
    });
  }

  // We need d3 slices for the label formatter, to determine if we should the
  // percent label on the chart for a specific slice
  const d3Pie = pie<PieSliceData>()
    .sort(null)
    // 1 degree in radians
    .padAngle((Math.PI / 180) * 1)
    .value(s => s.value);

  return {
    slices: d3Pie(slices),
    otherSlices: d3Pie(others),
    total,
    colDescs,
  };
}
