import Color from "color";

import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";

import { Cell } from "./PivotTableCell";

describe("conditionally formatted pivot cells", () => {
  it("uses readable text on a pale fill in dark mode", () => {
    renderWithProviders(
      <ThemeProvider resolvedColorScheme="dark">
        <Cell
          value="14,837.32"
          backgroundColor="rgba(192, 223, 157, 0.75)"
          isBody
        />
      </ThemeProvider>,
    );
    const cell = screen.getByTestId("pivot-table-cell");
    const foreground = cell.style.getPropertyValue("--pivot-cell-color");
    expect(
      Color(foreground).contrast(Color(cell.style.backgroundColor)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves a readable translucent fill in light mode", () => {
    renderWithProviders(
      <ThemeProvider resolvedColorScheme="light">
        <Cell
          value="14,837.32"
          backgroundColor="rgba(192, 223, 157, 0.75)"
          isBody
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("pivot-table-cell")).toHaveStyle({
      backgroundColor: "rgba(192, 223, 157, 0.75)",
    });
  });
});
