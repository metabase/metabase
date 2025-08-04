import { getNextId } from "__support__/utils";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { formatValue } from "metabase/lib/formatting";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import {
  isAddress,
  isCountry,
  isCurrency,
  isDateWithoutTime,
  isEntityName,
  isNumber,
  isPK,
  isState,
} from "metabase-lib/v1/types/utils/isa";
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
  const headerFields = fields.filter((f) => isEntityName(f) || isPK(f));
  const subheaderFields = fields.filter(
    (f) => isState(f) || isCountry(f) || isDateWithoutTime(f) || isAddress(f),
  );
  const highlight1Fields = fields.filter((f) => isNumber(f));
  const highlight2Fields = fields.filter((f) => isCurrency(f));

  const normalFields = fields;

  return {
    sections: [
      {
        id: getNextId(),
        title: "Header",
        variant: "header",
        fields: headerFields.map((field) => ({
          field_id: getRawTableFieldId(field),
        })),
      },
      {
        id: getNextId(),
        title: "Subheader",
        variant: "subheader",
        fields: subheaderFields.map((field) => ({
          field_id: getRawTableFieldId(field),
        })),
      },
      {
        id: getNextId(),
        title: "Highlight level 1",
        variant: "highlight-1",
        fields: highlight1Fields.map((field) => ({
          field_id: getRawTableFieldId(field),
        })),
      },
      {
        id: getNextId(),
        title: "Highlight level 2",
        variant: "highlight-2",
        fields: highlight2Fields.map((field) => ({
          field_id: getRawTableFieldId(field),
        })),
      },
      {
        id: getNextId(),
        title: "Info",
        variant: "normal",
        fields: normalFields.map((field) => ({
          field_id: getRawTableFieldId(field),
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
