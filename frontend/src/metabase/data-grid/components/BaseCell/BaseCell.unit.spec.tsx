import Color from "color";

import { renderWithProviders, screen } from "__support__/ui";
import { ThemeProvider } from "metabase/ui";

import { BaseCell } from "./BaseCell";

interface SetupOpts {
  colorScheme: "light" | "dark";
  isSelected?: boolean;
}

function setup({ colorScheme, isSelected }: SetupOpts) {
  renderWithProviders(
    <ThemeProvider resolvedColorScheme={colorScheme}>
      <BaseCell
        data-testid="cell"
        backgroundColor="rgba(192, 223, 157, 0.75)"
        isSelected={isSelected}
      >
        14,837.32
      </BaseCell>
    </ThemeProvider>,
  );
  return screen.getByTestId("cell");
}

describe("BaseCell conditional formatting", () => {
  it("keeps normal and hovered text readable in dark mode", () => {
    const cell = setup({ colorScheme: "dark" });
    for (const state of ["", "hover-"]) {
      const text = cell.style.getPropertyValue(`--cell-${state}text-color`);
      const background = cell.style.getPropertyValue(`--cell-${state}bg-color`);
      expect(Color(text).contrast(Color(background))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it("keeps the existing light theme foreground and fill when they pass", () => {
    const cell = setup({ colorScheme: "light" });
    expect(cell.style.getPropertyValue("--cell-text-color")).toBe("");
    expect(cell.style.getPropertyValue("--cell-bg-color")).toBe(
      "rgba(192, 223, 157, 0.75)",
    );
  });

  it("returns to the theme text when selection replaces the formatting background", () => {
    const cell = setup({ colorScheme: "dark", isSelected: true });
    expect(cell.style.getPropertyValue("--cell-text-color")).toBe("");
    expect(cell.style.getPropertyValue("--cell-hover-text-color")).toBe("");
  });
});
