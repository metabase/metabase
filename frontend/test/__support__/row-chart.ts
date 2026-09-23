import { within } from "@testing-library/react";

export type RowChartSymbol = "bar" | "goal line";

export function getExpectedRowChartGoalX(
  container: HTMLElement,
  goalValue: number,
  maxValue: number,
) {
  const widestBar = getRowChartSymbols(container, "bar").reduce((widest, bar) =>
    Number(bar.getAttribute("width")) > Number(widest.getAttribute("width"))
      ? bar
      : widest,
  );
  const x = Number(widestBar.getAttribute("x"));
  const width = Number(widestBar.getAttribute("width"));
  return x + (width * goalValue) / maxValue;
}

export function getRowChartGoalLineX(goalLine: HTMLElement) {
  return Number(goalLine.querySelector("line")?.getAttribute("x1"));
}

export function getRowChartSymbols(
  container: HTMLElement,
  roleDescription: RowChartSymbol,
) {
  return within(container)
    .queryAllByRole("graphics-symbol")
    .filter(
      (element) =>
        element.getAttribute("aria-roledescription") === roleDescription,
    );
}
