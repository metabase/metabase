import { NULL_DISPLAY_VALUE } from "metabase/utils/constants";
import type { DatasetColumn } from "metabase-types/api";

// structural subset of both DatasetColumn and Field
export function displayNameForColumn(
  column: Pick<DatasetColumn, "display_name" | "remapped_to_column">,
): string {
  return (
    column.remapped_to_column?.display_name ??
    column.display_name ??
    NULL_DISPLAY_VALUE
  );
}
