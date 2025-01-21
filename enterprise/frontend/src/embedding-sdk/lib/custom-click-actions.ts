import type { MetabaseVisualizationClickEvent } from "embedding-sdk/types/custom-click-actions";
import type { ClickObject, ClickObjectDataRow } from "metabase-lib";
import type { RowValue } from "metabase-types/api";

export function transformSdkClickObject(
  clicked: ClickObject,
): MetabaseVisualizationClickEvent {
  const column = clicked.column && {
    id: clicked.column.id,
    name: clicked.column.name,
    displayName: clicked.column.display_name,
  };

  return {
    type: "table",
    value: clicked.value,
    column,
    row: clicked.data && getRowObject(clicked.data),
  };
}

export function getRowObject(
  rows: ClickObjectDataRow[],
): Record<string, RowValue> {
  const row: Record<string, RowValue> = {};

  for (const { value, col } of rows) {
    if (!col?.name) {
      continue;
    }

    row[col.name] = value;
  }

  return row;
}
