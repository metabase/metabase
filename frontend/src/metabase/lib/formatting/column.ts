import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import type { DatasetColumn } from "metabase-types/api/dataset";

export function displayNameForColumn(column: DatasetColumn): string {
  return (
    column?.remapped_to_column?.display_name ??
    column?.display_name ??
    NULL_DISPLAY_VALUE
  );
}
