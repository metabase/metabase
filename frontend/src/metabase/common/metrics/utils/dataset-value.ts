import { t } from "ttag";

import { formatValue } from "metabase/value-formatting";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type { Dataset } from "metabase-types/api";

export function isDatasetScalar(dataset: Dataset) {
  if (dataset.error) {
    return false;
  }
  return dataset.data.cols.length === 1 && dataset.data.rows.length === 1;
}

export function isDatasetTemporalMetric(dataset: Dataset) {
  if (dataset.error) {
    return false;
  }

  const cols = dataset.data.cols;
  if (cols.length !== 2) {
    return false;
  }

  const col = cols[0];

  // TODO(romeovs): isDate should not be used but there is not easy alternative for now
  if (!isDate(col)) {
    return false;
  }

  return true;
}

export function getDatasetValueForMetric(dataset: Dataset) {
  if (isDatasetScalar(dataset)) {
    return getMetricValueForScalarMetric(dataset);
  }
  if (isDatasetTemporalMetric(dataset)) {
    return getMetricValueForTemporalMetric(dataset);
  }
  return null;
}

export function getMetricValueForScalarMetric(dataset: Dataset) {
  const { cols, rows } = dataset.data;

  const lastRow = rows?.at(-1) ?? [];

  const [value] = lastRow;
  const [valueColumn] = cols;

  if (value === undefined) {
    return null;
  }

  return {
    label: t`Overall`,
    value: formatValue(value, {
      jsx: true,
      rich: true,
      column: valueColumn,
    }),
  };
}

export function getMetricValueForTemporalMetric(dataset: Dataset) {
  // This returns the last row of the dataset, which usually represents the latest
  // value of a metric with a temporal breakout.
  // However, if the metric has values in the future, or a sort clause that changes
  // the order of the rows, this will not return the latest value per se.
  const { cols, rows } = dataset.data;

  if (!rows || rows.length < 1) {
    return null;
  }

  const lastRow = rows?.at(-1);
  if (!lastRow) {
    return null;
  }

  const [label, value] = lastRow;
  const [labelColumn, valueColumn] = cols;

  if (value === undefined) {
    return null;
  }

  return {
    label: formatValue(label, {
      jsx: true,
      rich: true,
      column: labelColumn,
    }),
    value: formatValue(value, {
      jsx: true,
      rich: true,
      column: valueColumn,
    }),
  };
}
