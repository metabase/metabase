import { formatNumber } from "metabase/utils/formatting";
import { formatValue } from "metabase/value-formatting";
import {
  type GoalValueResult,
  getComputedSettings,
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/viz-core";
import { getColumnSettings } from "metabase-lib/v1/queries/utils/column-key";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Field,
  VisualizationSettings,
} from "metabase-types/api";

import type { ColumnOption } from "./types";

export function getNumericColumnOptions(
  columns: DatasetColumn[] | Field[],
): ColumnOption[] {
  return columns.filter(isNumeric).map((column) => ({
    name: column.name,
    label: column.display_name || column.name,
  }));
}

export function formatGoalValue(
  { value, column }: GoalValueResult,
  visualizationSettings: VisualizationSettings | undefined,
): string | null {
  if (value == null) {
    return null;
  }

  if (column == null) {
    return formatNumber(value);
  }

  const columnSettings = getComputedSettings(
    getSettingDefinitionsForColumn([], column),
    column,
    {
      ...getGlobalSettingsForColumn(),
      ...column.settings,
      ...getColumnSettings(visualizationSettings, column),
    },
  );

  return String(formatValue(value, { ...columnSettings, column }));
}
