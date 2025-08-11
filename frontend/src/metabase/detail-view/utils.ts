import type { ContentTranslationFunction } from "metabase/i18n/types";
import {
  type OptionsType,
  formatUrl,
  formatValue,
} from "metabase/lib/formatting";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import {
  isAvatarURL,
  isEntityName,
  isImageURL,
  isPK,
  isTitle,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, RowValue } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

export function renderValue(
  tc: ContentTranslationFunction,
  value: RowValue,
  column: DatasetColumn,
  optionsOverride?: OptionsType,
) {
  const mockSeries = [{ data: { cols: [column] }, card: createMockCard() }];
  const settingDefs = getSettingDefinitionsForColumn(mockSeries, column);
  const inheritedSettings = {
    ...getGlobalSettingsForColumn(),
    ...(column.settings || {}),
  };
  const finalSettings = getComputedSettings(
    settingDefs,
    column,
    inheritedSettings,
    {
      series: mockSeries,
    },
  );

  const NO_VALUE = "-";

  if (value === undefined) {
    return NO_VALUE;
  }

  if (!column) {
    return String(value) || NO_VALUE;
  }

  if (column.settings?.view_as === "link") {
    return formatUrl(String(tc(value)), {
      ...column.settings,
      ...finalSettings,
      column,
      type: "cell",
      jsx: true,
      rich: true,
      remap: true,
      clicked: {
        type: "cell",
        value,
        column,
      },
    });
  }

  const formattedValue = formatValue(tc(value), {
    ...column.settings,
    ...finalSettings,
    column,
    type: "cell",
    jsx: true,
    rich: true,
    remap: true,
    ...optionsOverride,
  });

  return formattedValue != null && formattedValue !== ""
    ? formattedValue
    : NO_VALUE;
}

export function getHeaderColumns(columns: DatasetColumn[]): DatasetColumn[] {
  return [
    getTitleColumn(columns),
    getSubtitleColumn(columns),
    getAvatarColumn(columns),
  ].filter((column): column is DatasetColumn => column != null);
}

export function getTitleColumn(
  columns: DatasetColumn[],
): DatasetColumn | undefined {
  const entityName = columns.find(isEntityName);
  const title = columns.find(isTitle);
  const pk = columns.find(isPK);

  return entityName ?? title ?? pk;
}

export function getSubtitleColumn(
  columns: DatasetColumn[],
): DatasetColumn | undefined {
  const titleColumn = getTitleColumn(columns);
  const pk = columns.find(isPK);

  if (titleColumn) {
    return titleColumn === pk ? undefined : pk;
  }

  return pk;
}

export function getAvatarColumn(
  columns: DatasetColumn[],
): DatasetColumn | undefined {
  const avatar = columns.find(isAvatarURL);
  const image = columns.find(isImageURL);

  return avatar ?? image;
}

export function getBodyColumns(columns: DatasetColumn[]): DatasetColumn[] {
  const headerColumns = getHeaderColumns(columns);
  return columns.filter((column) => !headerColumns.includes(column));
}

export function getRowName(
  columns: DatasetColumn[],
  row: RowValue[] | undefined,
): string | undefined {
  if (!row) {
    return undefined;
  }

  const title = getTitleColumn(columns);
  const rowName = getRowValue(columns, title, row);
  return String(rowName || "");
}

export function getRowValue(
  columns: DatasetColumn[],
  column: DatasetColumn | undefined,
  row: RowValue[] | undefined,
): RowValue | undefined {
  if (!row || !column) {
    return undefined;
  }

  const index = columns.indexOf(column);
  const value = row[index];
  return value;
}
