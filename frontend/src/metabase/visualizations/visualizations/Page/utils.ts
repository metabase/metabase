import { formatValue } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { DatasetColumn, RowValue } from "metabase-types/api";

/**
 * Replaces {{display_name}} tokens in a markdown template with formatted column
 * values from the current row.  Tokens are matched against each column's
 * `display_name` (case-insensitive) first, then against the raw `name` as a
 * fallback — mirroring how the Table chart's conditional-formatting and link
 * widgets refer to columns by their display name.
 */
export function substituteColumnsInTemplate(
  template: string,
  cols: DatasetColumn[],
  row: RowValue[],
  settings: ComputedVisualizationSettings,
): string {
  return template.replace(/\{\{([^}]+?)\}\}/g, (_match, token: string) => {
    const trimmed = token.trim();

    // Match by display_name first (case-insensitive), fall back to name
    const colIndex = (() => {
      const byDisplay = cols.findIndex(
        col => col.display_name.toLowerCase() === trimmed.toLowerCase(),
      );
      if (byDisplay !== -1) return byDisplay;

      return cols.findIndex(
        col => col.name.toLowerCase() === trimmed.toLowerCase(),
      );
    })();

    if (colIndex === -1) {
      // Leave unresolved tokens intact so the user can see what's wrong
      return `{{${trimmed}}}`;
    }

    const col = cols[colIndex];
    const value = row[colIndex];
    const colSettings: OptionsType = settings.column?.(col) ?? {};

    const formatted = formatValue(value, {
      ...colSettings,
      column: col,
      jsx: false,
    });

    return formatted == null ? "" : String(formatted);
  });
}
