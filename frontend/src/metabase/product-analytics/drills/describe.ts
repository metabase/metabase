import { t } from "ttag";

import { dayjs } from "metabase/dayjs";
import type { ClickObject } from "metabase/visualizations/types";

import type { Granularity } from "../spec/types";
import type { DrillPoint } from "../sql/compose";

const toPointValue = (value: unknown): DrillPoint[string] =>
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean"
    ? value
    : null;

/**
 * The clicked point's result values by column name. A sankey node click
 * carries only its own column; the rest of `data` would name both ends.
 */
export const getDrillPoint = (clicked: ClickObject): DrillPoint | null => {
  if (clicked.dimensions !== undefined && clicked.dimensions.length > 0) {
    return Object.fromEntries(
      clicked.dimensions.map(({ column, value }) => [
        column.name,
        toPointValue(value),
      ]),
    );
  }
  if (clicked.column !== undefined && clicked.value !== undefined) {
    return { [clicked.column.name]: toPointValue(clicked.value) };
  }
  if (clicked.data !== undefined) {
    return Object.fromEntries(
      clicked.data.flatMap(({ col, value }) =>
        col ? [[col.name, toPointValue(value)]] : [],
      ),
    );
  }
  return null;
};

/** How many actors the clicked point stands for, when the chart shows a count. */
export const getDrillCount = (
  clicked: ClickObject,
  countColumn: string,
): number | null =>
  clicked.column?.name === countColumn && typeof clicked.value === "number"
    ? Math.abs(clicked.value)
    : null;

/** A clicked period, e.g. "the week of Oct 5, 2026". */
export const formatPeriod = (value: unknown, unit: Granularity): string => {
  const date = dayjs(String(value));
  if (!date.isValid()) {
    return String(value);
  }
  switch (unit) {
    case "hour":
      return date.format("MMM D, YYYY, h A");
    case "day":
      return date.format("MMM D, YYYY");
    case "week": {
      const day = date.format("MMM D, YYYY");
      return t`the week of ${day}`;
    }
    case "month":
      return date.format("MMMM YYYY");
  }
};
