import type { DataGridTheme } from "metabase/data-grid/types";
import type { MantineTheme } from "metabase/ui";

export function tableThemeToDataGridTheme(
  tableTheme: MantineTheme["other"]["table"],
): DataGridTheme {
  return {
    stickyBackgroundColor: tableTheme.stickyBackgroundColor,
    fontSize: tableTheme.cell.fontSize,
    cell: {
      backgroundColor:
        tableTheme.cell.backgroundColor ?? "var(--mb-color-background-primary)",
      textColor: tableTheme.cell.textColor,
    },
    pillCell: {
      backgroundColor: tableTheme.idColumn?.backgroundColor,
      textColor: tableTheme.idColumn?.textColor,
    },
  };
}
