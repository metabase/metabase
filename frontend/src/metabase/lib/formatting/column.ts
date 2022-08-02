import { capitalize } from "./strings";

export function formatColumn(column) {
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
