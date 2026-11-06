import { isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetColumn, Field } from "metabase-types/api";

import type { ColumnOption } from "./types";

export function getNumericColumnOptions(
  columns: DatasetColumn[] | Field[],
): ColumnOption[] {
  return columns.filter(isNumeric).map((column) => ({
    name: column.name,
    label: column.display_name || column.name,
  }));
}
