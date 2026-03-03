import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import type { DatasetColumn, Field } from "metabase-types/api";

export function displayNameForColumn(column: DatasetColumn | Field): string {
  const remappedName =
    "remapped_to_column" in column
      ? column.remapped_to_column?.display_name
      : undefined;
  return remappedName ?? column?.display_name ?? NULL_DISPLAY_VALUE;
}
