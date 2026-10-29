import _ from "underscore";

import { mergeLazily, omitLazily } from "metabase/utils/merge-lazily";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  Series,
  TableColumnOrderSetting,
  VisualizationSettings,
} from "metabase-types/api";

import type { SeriesSettingDefinition } from "../../types";
import { columnsAreValid, getDefaultDimensionAndMetric } from "../utils";

export function getOptionFromColumn(col: DatasetColumn) {
  return {
    name: col.display_name,
    value: col.name,
  };
}

export function metricSetting(id: string, def: SeriesSettingDefinition = {}) {
  return fieldSetting(
    id,
    mergeLazily(
      {
        fieldFilter: isMetric,
        getDefault: (series: Series) =>
          getDefaultDimensionAndMetric(series).metric,
      },
      def,
    ),
  );
}

export function dimensionSetting(
  id: string,
  def: SeriesSettingDefinition = {},
) {
  return fieldSetting(
    id,
    mergeLazily(
      {
        fieldFilter: isDimension,
        getDefault: (series: Series) =>
          getDefaultDimensionAndMetric(series).dimension,
      },
      def,
    ),
  );
}

const DEFAULT_FIELD_FILTER = (_column: DatasetColumn) => true;

type FieldFilterFn = (column: DatasetColumn) => boolean;

export function getDefaultColumn(
  series: Series,
  _vizSettings: VisualizationSettings,
  fieldFilter: FieldFilterFn = DEFAULT_FIELD_FILTER,
): string | undefined {
  const [{ data }] = series;
  return data.cols.find(fieldFilter)?.name;
}

export function fieldSetting(
  id: string,
  options: SeriesSettingDefinition & {
    fieldFilter?: FieldFilterFn;
    showColumnSetting?: boolean;
    autoOpenWhenUnset?: boolean;
  } = {},
): {
  [id]: SeriesSettingDefinition;
} {
  // Read by name only the keys this helper consumes. Everything else is copied
  // by descriptor so getters survive.
  const {
    fieldFilter = DEFAULT_FIELD_FILTER,
    showColumnSetting,
    autoOpenWhenUnset,
  } = options;
  const def = omitLazily<SeriesSettingDefinition>(options, [
    "fieldFilter",
    "showColumnSetting",
    "autoOpenWhenUnset",
  ]);

  return {
    // mergeLazily returns the merged descriptors, which is this shape.
    [id]: mergeLazily(
      {
        widget: "field",
        isValid: ([{ card, data }]: Series) =>
          columnsAreValid(card.visualization_settings[id], data, fieldFilter),
        getDefault: (series: Series, vizSettings: VisualizationSettings) =>
          getDefaultColumn(series, vizSettings, fieldFilter),
        getProps: ([{ data }]: Series) => ({
          options: data.cols.filter(fieldFilter).map(getOptionFromColumn),
          columns: data.cols,
          showColumnSetting,
          autoOpenWhenUnset,
        }),
      },
      def,
    ) as SeriesSettingDefinition,
  };
}

export function getDeduplicatedTableColumnSettings(
  tableColumnsSettings: TableColumnOrderSetting[],
): TableColumnOrderSetting[] {
  return _.uniq(tableColumnsSettings, false, (item) => item.name);
}

type InsertNewColumnSettingsOpts<TSetting, TColumn extends { name: string }> = {
  getColumnName: (setting: TSetting) => string | undefined;
  isNewColumn: (column: TColumn, columnIndex: number) => boolean | undefined;
  createSetting: (column: TColumn) => TSetting;
};

/**
 * Keeps the user's order of existing settings and places each new column right
 * after the nearest preceding column that has a setting, so new columns follow
 * the query's column order.
 */
export function insertNewColumnSettings<
  TSetting,
  TColumn extends { name: string },
>(
  settings: TSetting[],
  columns: TColumn[],
  {
    getColumnName,
    isNewColumn,
    createSetting,
  }: InsertNewColumnSettingsOpts<TSetting, TColumn>,
): TSetting[] {
  if (settings.length === 0) {
    return columns.filter(isNewColumn).map(createSetting);
  }

  const nextSettings = [...settings];
  const settingNames = new Set(settings.map(getColumnName));
  columns.forEach((column, columnIndex) => {
    if (!isNewColumn(column, columnIndex)) {
      return;
    }
    const anchorName = findAnchorName(columns, columnIndex, settingNames);
    const insertIndex =
      anchorName == null
        ? 0
        : nextSettings.findIndex(
            (setting) => getColumnName(setting) === anchorName,
          ) + 1;
    nextSettings.splice(insertIndex, 0, createSetting(column));
    settingNames.add(column.name);
  });
  return nextSettings;
}

function findAnchorName(
  columns: { name: string }[],
  columnIndex: number,
  settingNames: Set<string | undefined>,
) {
  for (let index = columnIndex - 1; index >= 0; index--) {
    if (settingNames.has(columns[index].name)) {
      return columns[index].name;
    }
  }
  return null;
}
