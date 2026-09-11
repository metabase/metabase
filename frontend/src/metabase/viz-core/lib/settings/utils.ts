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
