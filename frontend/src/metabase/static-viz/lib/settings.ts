import {
  getDefaultCurrency,
  getDefaultCurrencyInHeader,
  getDefaultCurrencyStyle,
  getDefaultNumberSeparators,
  getDefaultNumberStyle,
} from "metabase/visualizations/shared/settings/column";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedDatasetColumn,
} from "metabase/visualizations/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import { isCoordinate, isNumber } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RawSeries,
  VisualizationSettings,
} from "metabase-types/api";

export const fillWithDefaultValue = (
  settings: Record<string, unknown>,
  key: string,
  defaultValue: unknown,
  isValid = true,
) => {
  if (typeof settings[key] === "undefined" || !isValid) {
    settings[key] = defaultValue;
  }
};

const getColumnSettings = (
  column: DatasetColumn,
  settings: VisualizationSettings,
): Record<string, unknown> => {
  const columnKey = Object.keys(settings.column_settings ?? {}).find(
    possiblyDenormalizedFieldRef =>
      normalize(possiblyDenormalizedFieldRef) === getColumnKey(column),
  );

  const columnSettings = columnKey
    ? { column, ...column.settings, ...settings.column_settings?.[columnKey] }
    : { column, ...column.settings };

  if (isNumber(column) && !isCoordinate(column)) {
    fillWithDefaultValue(columnSettings, "currency", getDefaultCurrency());
    fillWithDefaultValue(
      columnSettings,
      "number_style",
      getDefaultNumberStyle(column, columnSettings),
    );
    fillWithDefaultValue(
      columnSettings,
      "currency_style",
      getDefaultCurrencyStyle(column, columnSettings),
    );
    fillWithDefaultValue(
      columnSettings,
      "currency_in_header",
      getDefaultCurrencyInHeader(),
    );
    fillWithDefaultValue(
      columnSettings,
      "number_separators",
      getDefaultNumberSeparators(),
    );
  }

  return columnSettings;
};

export const getCommonStaticVizSettings = (
  rawSeries: RawSeries,
  dashcardSettings: VisualizationSettings,
) => {
  const [{ card }] = rawSeries;

  const settings: ComputedVisualizationSettings = {
    ...card.visualization_settings,
    column: (column: RemappingHydratedDatasetColumn) =>
      getColumnSettings(column, settings),
  };

  return { ...settings, ...dashcardSettings };
};
