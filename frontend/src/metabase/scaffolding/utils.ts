import { getNextId } from "__support__/utils";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import {
  type OptionsType,
  formatUrl,
  formatValue,
} from "metabase/lib/formatting";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { getComputedSettings } from "metabase/visualizations/lib/settings";
import {
  getGlobalSettingsForColumn,
  getSettingDefinitionsForColumn,
} from "metabase/visualizations/lib/settings/column";
import { isEntityName, isNumeric, isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  ObjectViewSettings,
  RowValue,
  StructuredDatasetQuery,
  Table,
} from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

// Process remapping metadata similar to extractRemappedColumns in visualizations
export function processRemappedColumns(
  columns: DatasetColumn[],
  rows: RowValue[][],
) {
  const processedColumns: (DatasetColumn & { remapping?: Map<any, any> })[] =
    columns.map((col) => ({
      ...col,
      remapping: col.remapped_to != null ? new Map() : undefined,
    }));

  const processedRows = rows.map((row) =>
    row.filter((value, colIndex) => {
      const col = processedColumns[colIndex];
      if (col.remapped_from != null) {
        const remappedFromIndex = processedColumns.findIndex(
          (c) => c.name === col.remapped_from,
        );
        if (
          remappedFromIndex === -1 ||
          !processedColumns[remappedFromIndex] ||
          !processedColumns[remappedFromIndex].remapping
        ) {
          console.warn("Invalid remapped_from", col);
          return true;
        }
        processedColumns[remappedFromIndex].remapping?.set(
          row[remappedFromIndex],
          row[colIndex],
        );
        return false;
      } else {
        return true;
      }
    }),
  );

  return {
    columns: processedColumns.filter((col) => col.remapped_from == null),
    rows: processedRows,
  };
}

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

export function getObjectQuery(
  table: Table,
  objectId: string | number,
): StructuredDatasetQuery | undefined {
  const pk = (table.fields ?? []).find(isPK);

  if (!pk) {
    return getTableQuery(table);
  }

  return {
    database: table.db_id,
    query: {
      "source-table": table.id,
      filter: [
        "=",
        [
          "field",
          getRawTableFieldId(pk),
          {
            "base-type": pk.base_type,
          },
        ],
        isNumeric(pk) && typeof objectId === "string"
          ? parseFloat(objectId)
          : objectId,
      ],
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
