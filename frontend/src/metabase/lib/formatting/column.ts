import { capitalize } from "./strings";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type { Column } from "metabase-types/types/Dataset";

export function formatColumn(column: Column): string {
  if (!column) {
    return "";
  } else if (column.remapped_to_column != null) {
    // remapped_to_column is a special field added by Visualization.jsx
    return formatColumn(column.remapped_to_column);
  } else {
    let columnTitle = getFriendlyName(column);
    if (column.unit && column.unit !== "default") {
      columnTitle += ": " + capitalize(column.unit.replace(/-/g, " "));
    }
    return columnTitle;
  }
}
