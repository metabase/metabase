import { pie } from "d3";
import { t } from "ttag";
import _ from "underscore";

import { findWithIndex } from "metabase/lib/arrays";
import { checkNotNull } from "metabase/lib/types";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import { pieNegativesWarning } from "metabase/visualizations/lib/warnings";
import {
  getAggregatedRows,
  getKeyFromDimensionValue,
} from "metabase/visualizations/shared/settings/pie";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RawSeries } from "metabase-types/api";

import type { ShowWarning } from "../../types";
import { OTHER_SLICE_KEY, OTHER_SLICE_MIN_PERCENTAGE } from "../constants";

import type {
  PieChartModel,
  PieColumnDescriptors,
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

export function getPieChartModel(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  hiddenSlices: Array<string | number> = [],
  renderingContext: RenderingContext,
  showWarning?: ShowWarning,
): PieChartModel {
  const [
    {
      data: { rows: dataRows },
    },
  ] = rawSeries;
  const colDescs = getColDescs(rawSeries, settings);

  const rowIndiciesByKey = new Map<string | number, number>();
  dataRows.forEach((row, index) => {
    const key = getKeyFromDimensionValue(row[colDescs.dimensionDesc.index]);

    if (rowIndiciesByKey.has(key)) {
      return;
    }
    rowIndiciesByKey.set(key, index);
  });

  const aggregatedRows = getAggregatedRows(
    dataRows,
    colDescs.dimensionDesc.index,
    colDescs.metricDesc.index,
    showWarning,
    colDescs.dimensionDesc.column,
  );

  const rowValuesByKey = new Map<string | number, number>();
  aggregatedRows.map(row =>
    rowValuesByKey.set(
      getKeyFromDimensionValue(row[colDescs.dimensionDesc.index]),
      getNumberOr(row[colDescs.metricDesc.index], 0),
    ),
  );

  const pieRows = settings["pie.rows"];
  if (pieRows == null) {
    throw Error("missing `pie.rows` setting");
  }

  const enabledPieRows = pieRows.filter(row => row.enabled && !row.hidden);

  const pieRowsWithValues = enabledPieRows.map(pieRow => {
    const value = rowValuesByKey.get(pieRow.key);
    if (value === undefined) {
      throw Error(`No row values found for key ${pieRow.key}`);
    }

    return {
      ...pieRow,
      value,
    };
  });
  const visiblePieRows = pieRowsWithValues.filter(row =>
    row.isOther
      ? !hiddenSlices.includes(OTHER_SLICE_KEY)
      : !hiddenSlices.includes(row.key),
  );

  // We allow negative values if every single metric value is negative or 0
  // (`isNonPositive` = true). If the values are mixed between positives and
  // negatives, we'll simply ignore the negatives in all calculations.
  const isNonPositive =
    visiblePieRows.every(row => row.value <= 0) &&
    !visiblePieRows.every(row => row.value === 0);

  const total = visiblePieRows.reduce((currTotal, { value }) => {
    if (!isNonPositive && value < 0) {
      showWarning?.(pieNegativesWarning().text);
      return currTotal;
    }

    return currTotal + value;
  }, 0);

  const [slices, others] = _.chain(pieRowsWithValues)
    .map(({ value, color, key, name, isOther }): PieSliceData => {
      const visible = isOther
        ? !hiddenSlices.includes(OTHER_SLICE_KEY)
        : !hiddenSlices.includes(key);
      return {
        key,
        name,
        value: isNonPositive ? -1 * value : value,
        displayValue: value,
        normalizedPercentage: visible ? value / total : 0, // slice percentage values are normalized to 0-1 scale
        rowIndex: rowIndiciesByKey.get(key),
        color,
        visible,
        isOther,
        noHover: false,
        includeInLegend: true,
      };
    })
    .filter(slice => isNonPositive || slice.value > 0)
    .partition(slice => slice != null && !slice.isOther)
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
    const visible = !hiddenSlices.includes(OTHER_SLICE_KEY);
    slices.push({
      key: OTHER_SLICE_KEY,
      name: t`Other`,
      value: otherTotal,
      displayValue: otherTotal,
      normalizedPercentage: visible ? otherTotal / total : 0,
      color: renderingContext.getColor("text-light"),
      visible,
      isOther: true,
      noHover: false,
      includeInLegend: true,
    });
  }

  slices.forEach(slice => {
    // We increase the size of small slices, otherwise they will not be visible
    // in echarts due to the border rendering over the tiny slice
    if (
      slice.visible &&
      slice.normalizedPercentage < OTHER_SLICE_MIN_PERCENTAGE
    ) {
      slice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
    }
  });

  // If there are no non-zero slices, we'll display a single "other" slice
  if (slices.length === 0) {
    slices.push({
      key: OTHER_SLICE_KEY,
      name: t`Other`,
      value: 1,
      displayValue: 0,
      normalizedPercentage: 0,
      color: renderingContext.getColor("text-light"),
      visible: true,
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
