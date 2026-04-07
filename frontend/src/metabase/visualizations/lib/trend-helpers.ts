import { t } from "ttag";

import { isEmpty } from "metabase/lib/validate";
import { computeChange } from "metabase/visualizations/lib/numeric";
import { formatPreviousPeriodOptionName } from "metabase/visualizations/visualizations/SmartScalar/utils";
import type { RowValues } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

export function findPreviousNonEmptyRowIndex(
  rows: RowValues[],
  dateColumnIndex: number,
  metricColumnIndex: number,
  beforeIndex: number,
): number {
  for (let index = beforeIndex - 1; index >= 0; index--) {
    const date = rows[index][dateColumnIndex];
    const value = rows[index][metricColumnIndex];
    if (!isEmpty(value) && !isEmpty(date)) {
      return index;
    }
  }
  return -1;
}

export type PreviousPeriodChange = {
  percent: number;
  description: string;
};

export function computePreviousPeriodChange(
  rows: RowValues[],
  dateColumnIndex: number,
  metricColumnIndex: number,
  latestRowIndex: number,
  currentValue: unknown,
  dateUnit: string | undefined,
): PreviousPeriodChange | undefined {
  const previousRowIndex = findPreviousNonEmptyRowIndex(
    rows,
    dateColumnIndex,
    metricColumnIndex,
    latestRowIndex,
  );

  if (previousRowIndex === -1) {
    return undefined;
  }

  const previousValue = rows[previousRowIndex][metricColumnIndex];
  if (isEmpty(previousValue) || typeof previousValue !== "number") {
    return undefined;
  }

  if (typeof currentValue !== "number") {
    return undefined;
  }

  const percent = computeChange(previousValue, currentValue);
  if (!isFinite(percent)) {
    return undefined;
  }

  const description =
    dateUnit && isAbsoluteDateTimeUnit(dateUnit)
      ? t`compared to ${formatPreviousPeriodOptionName(dateUnit).toLocaleLowerCase()}`
      : t`compared to previous value`;

  return { percent, description };
}
