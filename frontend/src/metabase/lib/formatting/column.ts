import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type { DatasetColumn } from "metabase-types/api/dataset";

export function formatColumn(column: DatasetColumn): string {
  if (!column) {
    return "";
  } else if (column.remapped_to_column != null) {
    // remapped_to_column is a special field added by Visualization.jsx
    return formatColumn(column.remapped_to_column);
  } else {
    return getFriendlyName(column);
  }
}
