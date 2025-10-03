import type { DataGridTheme } from "metabase/data-grid/types";
import type { MantineTheme } from "metabase/ui";

export function tableThemeToDataGridTheme(
  tableTheme: MantineTheme["other"]["table"],
  backgroundColor?: string,
): DataGridTheme {
  const nonTransparentBackgroundColor =
    backgroundColor === "transparent"
      ? "var(--mb-color-background)"
      : backgroundColor;

  return {
    stickyBackgroundColor: tableTheme.stickyBackgroundColor,
    fontSize: tableTheme.cell.fontSize,
    cell: {
      backgroundColor:
        tableTheme.cell.backgroundColor ?? nonTransparentBackgroundColor,
      textColor: tableTheme.cell.textColor,
    },
    pillCell: {
      backgroundColor: tableTheme.idColumn?.backgroundColor,
      textColor: tableTheme.idColumn?.textColor,
    },
  };
}
