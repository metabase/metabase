import type { MantineTheme } from "metabase/ui";

import { tableThemeToDataGridTheme } from "./table-theme-to-data-grid-theme";

describe("tableThemeToDataGridTheme", () => {
  const mockTableTheme: MantineTheme["other"]["table"] = {
    stickyBackgroundColor: "#ffffff",
    stripedBackgroundColor: "#eeeeee",
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
      stripedBackgroundColor: "#eeeeee",
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

  it("leaves cell.backgroundColor unset when the theme has none", () => {
    const themeWithoutCellBg = {
      ...mockTableTheme,
      cell: { ...mockTableTheme.cell, backgroundColor: undefined },
    };

    const result = tableThemeToDataGridTheme(themeWithoutCellBg);

    expect(result.cell?.backgroundColor).toBeUndefined();
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

  it("resolves em fontSize to px when baseFontSize is provided", () => {
    const themeWithEmFontSize = {
      ...mockTableTheme,
      cell: { ...mockTableTheme.cell, fontSize: "0.893em" },
    };

    const result = tableThemeToDataGridTheme(themeWithEmFontSize, "14px");

    expect(result.fontSize).toBe("12.5px");
  });

  it("keeps px fontSize unchanged when baseFontSize is provided", () => {
    const result = tableThemeToDataGridTheme(mockTableTheme, "14px");

    expect(result.fontSize).toBe("14px");
  });
});
