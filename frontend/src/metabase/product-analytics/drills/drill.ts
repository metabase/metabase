import _ from "underscore";

import type { ClickObject } from "metabase/visualizations/types";
import type * as Lib from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import type { CommonSettings } from "../analyses/types";

const isDrillValue = (value: unknown): value is Lib.AnalysisDrillValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const isDrillDimension = (
  value: unknown,
): value is Lib.AnalysisDrillDimension =>
  isObject(value) && value.column_ref != null && isDrillValue(value.value);

/** Whether a stored value is a drill the planner can read. */
export const isAnalysisDrill = (value: unknown): value is Lib.AnalysisDrill =>
  isObject(value) &&
  value.type === "actors" &&
  Array.isArray(value.dimensions) &&
  value.dimensions.length > 0 &&
  value.dimensions.every(isDrillDimension);

const toDrillDimension = (
  column: DatasetColumn,
  value: RowValue,
): Lib.AnalysisDrillDimension | null =>
  isDrillValue(value) && column.field_ref != null
    ? { column_ref: column.field_ref, value }
    : null;

/**
 * A drill to the actors in the clicked cell of an analysis's chart. `null`
 * when the click isn't on a cell, like a click on a legend.
 */
export const getClickedDrill = (
  clicked: ClickObject,
): Lib.AnalysisDrill | null => {
  const dimensions = (clicked.dimensions ?? []).map(({ column, value }) =>
    toDrillDimension(column, value),
  );
  const areDimensionsValid =
    dimensions.length > 0 &&
    dimensions.every(
      (dimension): dimension is Lib.AnalysisDrillDimension =>
        dimension !== null,
    );
  return areDimensionsValid ? { type: "actors", dimensions } : null;
};

/**
 * The changes to store for `changes` to `settings`. `null` when they change
 * nothing. A change to any other setting clears the drill, since the drill's
 * cell is in the result the change replaces.
 */
export const getSettingsChanges = <TSettings extends CommonSettings>(
  settings: TSettings,
  changes: Partial<TSettings>,
): Partial<TSettings> | null => {
  const currentSettings: Partial<Record<string, unknown>> = settings;
  const isChanged = Object.entries(changes).some(
    ([key, value]) => !_.isEqual(currentSettings[key], value),
  );
  if (!isChanged) {
    return null;
  }
  const shouldClearDrill = settings.drill !== null && !("drill" in changes);
  return shouldClearDrill ? { ...changes, drill: null } : changes;
};
