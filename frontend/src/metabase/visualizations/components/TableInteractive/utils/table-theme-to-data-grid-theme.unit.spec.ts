import type { MantineTheme } from "metabase/ui";

import { tableThemeToDataGridTheme } from "./table-theme-to-data-grid-theme";

describe("tableThemeToDataGridTheme", () => {
  const mockTableTheme: MantineTheme["other"]["table"] = {
    stickyBackgroundColor: "#ffffff",
    cell: {
      fontSize: "14px",
      backgroundColor: "#f5f5f5",
      textColor: "#333333",
    },
    idColumn: {
      backgroundColor: "#e0e0e0",
      textColor: "#111111",
    },
  };

  it("converts table theme to data grid theme", () => {
    const result = tableThemeToDataGridTheme(mockTableTheme);

    expect(result).toEqual({
      stickyBackgroundColor: "#ffffff",
      fontSize: "14px",
      cell: {
        backgroundColor: "#f5f5f5",
        textColor: "#333333",
      },
      pillCell: {
        backgroundColor: "#e0e0e0",
        textColor: "#111111",
      },
    });
  });

  it("replaces transparent backgroundColor with CSS variable", () => {
    const themeWithoutCellBg = {
      ...mockTableTheme,
      cell: { ...mockTableTheme.cell, backgroundColor: undefined },
    };

    const result = tableThemeToDataGridTheme(themeWithoutCellBg);

    expect(result.cell?.backgroundColor).toBe(
      "var(--mb-color-background-primary)",
    );
  });

  it("prefers cell.backgroundColor over provided backgroundColor", () => {
    const result = tableThemeToDataGridTheme(mockTableTheme);

    expect(result.cell?.backgroundColor).toBe("#f5f5f5");
  });

  it("handles missing idColumn", () => {
    const themeWithoutIdColumn = {
      ...mockTableTheme,
      idColumn: undefined,
    };

    const result = tableThemeToDataGridTheme(themeWithoutIdColumn);

    expect(result.pillCell).toEqual({
      backgroundColor: undefined,
      textColor: undefined,
    });
  });
});
