import type { DataGridTheme } from "metabase/data-grid/types";
import type { MantineTheme } from "metabase/ui";

import { resolveFontSizeToPx } from "./resolve-font-size-to-px";

export function tableThemeToDataGridTheme(
  tableTheme: MantineTheme["other"]["table"],
  baseFontSize?: string,
): DataGridTheme {
  return {
    stickyBackgroundColor: tableTheme.stickyBackgroundColor,
    fontSize: resolveFontSizeToPx(tableTheme.cell.fontSize, baseFontSize),
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
