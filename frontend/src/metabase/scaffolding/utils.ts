import { getNextId } from "__support__/utils";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { type OptionsType, formatValue } from "metabase/lib/formatting";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import { isEntityName, isPK } from "metabase-lib/v1/types/utils/isa";
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

  const formattedValue = formatValue(tc(value), {
    ...column.settings,
    ...finalSettings,
    column,
    type: "cell",
    jsx: true,
    rich: true,
    ...optionsOverride,
  });

  return formattedValue != null ? formattedValue : NO_VALUE;
}

export function getDefaultObjectViewSettings(
  table: Table | undefined,
): ObjectViewSettings {
  const fields = table?.fields ?? [];
  const headerFields = fields
    .filter((f) => isEntityName(f) || isPK(f))
    .slice(0, 3);
  // const normalFields = fields.filter((f) => !headerFields.includes(f));

  return {
    sections: [
      {
        id: getNextId(),
        title: "Title",
        variant: "header",
        fields: headerFields.map((field) => ({
          field_id: getRawTableFieldId(field),
        })),
      },
      {
        id: getNextId(),
        title: "Subtitle",
        variant: "subheader",
        fields: [],
      },
      // {
      //   id: getNextId(),
      //   title: "Data Highlight",
      //   variant: "highlight-1",
      //   fields: [],
      // },
      // {
      //   id: getNextId(),
      //   title: "Highlight level 2",
      //   variant: "highlight-2",
      //   fields: [],
      // },
      // {
      //   id: getNextId(),
      //   title: "Info",
      //   variant: "normal",
      //   fields: normalFields.map((field) => ({
      //     field_id: getRawTableFieldId(field),
      //   })),
      // },
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

export function getStyleProps(style: "bold" | "dim" | "title" | "normal") {
  switch (style) {
    case "bold":
      return { fw: 700 };
    case "dim":
      return { color: "text-light" };
    case "title":
      return { size: "xl", fw: 700 };
    default:
      return {};
  }
}
