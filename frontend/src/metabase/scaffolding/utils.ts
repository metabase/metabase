import { getNextId } from "__support__/utils";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { formatValue } from "metabase/lib/formatting";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import type {
  DatasetColumn,
  ObjectViewSettings,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

export function renderValue(
  tc: ContentTranslationFunction,
  value: RowValue,
  column: DatasetColumn,
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

  if (value === undefined) {
    return "";
  }

  if (!column) {
    return String(value);
  }

  return formatValue(tc(value), {
    ...column.settings,
    ...finalSettings,
    column,
    type: "cell",
    jsx: true,
    rich: true,
  });
}

export function getDefaultObjectViewSettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];

  return {
    sections: [
      {
        id: getNextId(),
        title: "Info",
        direction: "vertical",
        fields: fields.map((field) => ({
          field_id: getRawTableFieldId(field),
          style: "normal",
        })),
      },
    ],
  };
}

export function getTableQuery(
  table: Table,
): StructuredDatasetQuery | undefined {
  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
    },
    type: "query",
  };
}
