import Color from "color";
import _ from "underscore";

import { getColorsForValues } from "metabase/lib/colors/charts";
import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import { checkNotNull, checkNumber, isNumber } from "metabase/lib/types";
import { SLICE_THRESHOLD } from "metabase/visualizations/echarts/pie/constants";
import { getPieColumns } from "metabase/visualizations/echarts/pie/model";
import type { PieRow } from "metabase/visualizations/echarts/pie/model/types";
import type { ShowWarning } from "metabase/visualizations/echarts/types";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import { getDefaultDimensionsAndMetrics } from "metabase/visualizations/lib/utils";
import { unaggregatedDataWarningPie } from "metabase/visualizations/lib/warnings";
import type {
  ComputedVisualizationSettings,
  Formatter,
} from "metabase/visualizations/types";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  RowValues,
} from "metabase-types/api";

export function getPieDimensions(settings: ComputedVisualizationSettings) {
  const dimensionSetting = settings["pie.dimension"];

  if (dimensionSetting == null) {
    throw new Error("`pie.dimension` is undefined");
  }
  if (Array.isArray(dimensionSetting)) {
    return dimensionSetting;
  }
  return [dimensionSetting];
}

export function getDefaultPieColumns(rawSeries: RawSeries) {
  const { dimensions, metrics } = getDefaultDimensionsAndMetrics(
    rawSeries,
    3,
    1,
  );
  return {
    dimension: dimensions,
    metric: metrics[0],
  };
}

export const getDefaultShowLegend = () => true;

export const getDefaultShowTotal = () => true;

export function getDefaultShowLabels(settings: ComputedVisualizationSettings) {
  if (getPieDimensions(settings).length <= 1) {
    return false;
  }
  return true;
}

export const getDefaultPercentVisibility = () => "legend";

export const getDefaultSliceThreshold = () => SLICE_THRESHOLD * 100;

export function getKeyFromDimensionValue(dimensionValue: RowValue) {
  if (dimensionValue == null) {
    return NULL_DISPLAY_VALUE;
  }
  return String(dimensionValue);
}

export function getAggregatedRows(
  rows: RowValues[],
  dimensionIndex: number,
  metricIndex: number,
  showWarning?: ShowWarning,
  dimensionColumn?: DatasetColumn,
) {
  const dimensionToMetricValues = new Map<string, number>();
  rows.forEach(row => {
    const dimensionValue = String(row[dimensionIndex]);
    const metricValue = getNumberOr(row[metricIndex], 0);

    const existingMetricValue =
      dimensionToMetricValues.get(dimensionValue) ?? 0;

    dimensionToMetricValues.set(
      dimensionValue,
      metricValue + existingMetricValue,
    );
  });

  const aggregatedRows: RowValues[] = [];
  const seenDimensionValues = new Set<string>();

  rows.forEach(row => {
    const dimensionValue = String(row[dimensionIndex]);
    if (seenDimensionValues.has(dimensionValue)) {
      return;
    }
    seenDimensionValues.add(dimensionValue);

    const metricValue = dimensionToMetricValues.get(dimensionValue);
    if (metricValue === undefined) {
      throw Error(
        `No metric value found for dimension value ${dimensionValue}`,
      );
    }
    const newRow = [...row];
    newRow[metricIndex] = metricValue;

    aggregatedRows.push(newRow);
  });

  if (showWarning != null && aggregatedRows.length < rows.length) {
    if (dimensionColumn == null) {
      throw Error("Missing `dimensionColumn`");
    }

    showWarning?.(unaggregatedDataWarningPie(dimensionColumn).text);
  }

  return aggregatedRows;
}

export function getSortedRows(rows: RowValues[], metricIndex: number) {
  return rows.sort((rowA, rowB) => {
    const valueA = rowA[metricIndex];
    const valueB = rowB[metricIndex];

    if (!isNumber(valueA) && !isNumber(valueB)) {
      return 0;
    }
    if (!isNumber(valueA)) {
      return 1;
    }
    if (!isNumber(valueB)) {
      return -1;
    }
    return valueB - valueA;
  });
}

export function getColors(
  rawSeries: RawSeries,
  currentSettings: Partial<ComputedVisualizationSettings>,
) {
  const [
    {
      data: { rows, cols },
    },
  ] = rawSeries;
  const dimensionName = getPieDimensions(currentSettings)[0];

  const dimensionIndex = cols.findIndex(col => col.name === dimensionName);
  const metricIndex = cols.findIndex(
    col => col.name === currentSettings["pie.metric"],
  );
  const sortedRows = getSortedRows(
    getAggregatedRows(rows, dimensionIndex, metricIndex),
    metricIndex,
  );

  const dimensionValues = sortedRows.map(r => String(r[dimensionIndex]));

  // Sometimes viz settings are malformed and "pie.colors" does not
  // contain a key for the current dimension value, so we need to compute
  // defaults to ensure every key has a color.
  const defaultColors = getColorsForValues(
    dimensionValues,
    currentSettings["pie.colors"],
  );

  return { ...defaultColors, ...currentSettings["pie.colors"] };
}

export function getPieRows(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
  formatter: Formatter,
) {
  const [
    {
      data: { rows: dataRows },
    },
  ] = rawSeries;

  if (!settings["pie.metric"] || !settings["pie.dimension"]) {
    return [];
  }

  const hasSortDimensionChanged =
    settings["pie.sort_rows_dimension"] != null &&
    settings["pie.sort_rows_dimension"] !== settings["pie.dimension"];

  const { metricDesc, dimensionDesc } = getPieColumns(rawSeries, settings);

  const getColumnSettings = settings["column"];
  if (!getColumnSettings) {
    throw Error("`settings.column` is undefined");
  }

  const dimensionColSettings = getColumnSettings(dimensionDesc.column);

  const formatDimensionValue = (value: RowValue) => {
    if (value == null) {
      return NULL_DISPLAY_VALUE;
    }

    return formatter(value, dimensionColSettings);
  };

  let colors = getColors(rawSeries, settings);
  // `pie.colors` is a legacy setting used by old questions for their
  // colors. We'll still read it to preserve those color selections, but
  // will no longer write values to it, instead storing colors here in
  // `pie.rows`.
  if (settings["pie.colors"] != null) {
    colors = { ...colors, ...settings["pie.colors"] };
  }

  const currentDataRows = getAggregatedRows(
    dataRows,
    dimensionDesc.index,
    metricDesc.index,
  );
  const keyToCurrentDataRow = new Map<PieRow["key"], RowValues>(
    currentDataRows.map(dataRow => [
      getKeyFromDimensionValue(dataRow[dimensionDesc.index]),
      dataRow,
    ]),
  );
  const currentDataKeys = Array.from(keyToCurrentDataRow.keys());

  const savedPieRows = hasSortDimensionChanged
    ? []
    : (settings["pie.rows"] ?? []);

  const savedPieKeys = savedPieRows.map(pieRow => pieRow.key);

  const keyToSavedPieRow = new Map<PieRow["key"], PieRow>(
    savedPieRows.map(pieRow => [pieRow.key, pieRow]),
  );
  const removed = _.difference(savedPieKeys, currentDataKeys);

  let newPieRows: PieRow[] = [];
  // Case 1: Auto sorted, sort existing and new rows together
  if (settings["pie.sort_rows"]) {
    const sortedCurrentDataRows = getSortedRows(
      currentDataRows,
      metricDesc.index,
    );

    newPieRows = sortedCurrentDataRows.map(dataRow => {
      const dimensionValue = dataRow[dimensionDesc.index];
      const key = getKeyFromDimensionValue(dimensionValue);
      // Historically we have used the dimension value in the `pie.colors`
      // setting instead of the key computed above. For compatibility with
      // existing questions we will continue to use the dimension value.
      //
      // Additionally, some older questions have non-hex color values such as
      // hsl strings so we need to convert everything to hsl for compatibilty
      // with Batik in the backend static viz rendering pipeline.
      const color = Color(colors[String(dimensionValue)]).hex();

      const savedRow = keyToSavedPieRow.get(key);
      if (savedRow != null) {
        const newRow = { ...savedRow, hidden: false };

        if (savedRow.defaultColor) {
          newRow.color = color;
        }

        return newRow;
      }

      const name = formatDimensionValue(dimensionValue);

      return {
        key,
        name,
        originalName: name,
        color,
        defaultColor: true,
        enabled: true,
        hidden: false,
        isOther: false,
      };
    });
    // Case 2: Preserve manual sort for existing rows, sort `added` rows
  } else {
    const added = _.difference(currentDataKeys, savedPieKeys);
    const kept = _.intersection(savedPieKeys, currentDataKeys);

    newPieRows = kept.map(keptKey => {
      const savedPieRow = keyToSavedPieRow.get(keptKey);
      if (savedPieRow == null) {
        throw Error(`Did not find saved pie row for kept key ${keptKey}`);
      }

      return {
        ...savedPieRow,
        hidden: false,
      };
    });

    const addedRows = added.map(addedKey => {
      const dataRow = keyToCurrentDataRow.get(addedKey);
      if (dataRow == null) {
        throw Error(`Could not find data row for added key ${addedKey}`);
      }

      return dataRow;
    });
    const sortedAddedRows = getSortedRows(addedRows, metricDesc.index);

    newPieRows.push(
      ...sortedAddedRows.map(addedDataRow => {
        const dimensionValue = addedDataRow[dimensionDesc.index];

        const color = Color(colors[String(dimensionValue)]).hex();
        const key = getKeyFromDimensionValue(dimensionValue);
        const name = formatDimensionValue(dimensionValue);

        return {
          key,
          name,
          originalName: name,
          color,
          defaultColor: true,
          enabled: true,
          hidden: false,
          isOther: false,
        };
      }),
    );
  }

  const removedPieRows = removed.map(removedKey => {
    const savedPieRow = keyToSavedPieRow.get(removedKey);
    if (savedPieRow == null) {
      throw Error(`Did not find saved pie row for removed key ${removedKey}`);
    }

    return {
      ...savedPieRow,
      hidden: true,
    };
  });
  newPieRows.push(...removedPieRows);

  // Make any slices below mimium slice percentage hidden
  const total = newPieRows.reduce((currTotal, pieRow) => {
    if (pieRow.hidden || !pieRow.enabled) {
      return currTotal;
    }
    return (
      currTotal +
      checkNumber(
        checkNotNull(keyToCurrentDataRow.get(pieRow.key))[metricDesc.index],
      )
    );
  }, 0);

  let otherCount = 0;
  newPieRows.forEach(pieRow => {
    if (pieRow.hidden) {
      return;
    }

    const metricValue = checkNumber(
      checkNotNull(keyToCurrentDataRow.get(pieRow.key))[metricDesc.index],
    );
    const normalizedPercentage = metricValue / total;

    const belowThreshold =
      normalizedPercentage < (settings["pie.slice_threshold"] ?? 0) / 100;

    pieRow.isOther = belowThreshold;

    if (belowThreshold && !pieRow.hidden && pieRow.enabled) {
      otherCount += 1;
    }
  });

  // If there's only one slice below minimum slice percentage, don't hide it
  if (otherCount <= 1) {
    newPieRows.forEach(pieRow => {
      pieRow.isOther = false;
    });
  }

  return newPieRows;
}

export const getPieSortRowsDimensionSetting = (
  settings: ComputedVisualizationSettings,
) => {
  return settings["pie.dimension"];
};

export const getDefaultSortRows = () => true;
