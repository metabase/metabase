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
