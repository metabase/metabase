import { within } from "@testing-library/react";

export type RowChartSymbol = "bar" | "goal line";

export function getExpectedRowChartGoalX(
  container: HTMLElement,
  goalValue: number,
  maxValue: number,
) {
  const bars = getRowChartSymbols(container, "bar");
  const widestBar = bars.reduce(
    (widest, bar) => (getWidth(bar) > getWidth(widest) ? bar : widest),
    bars[0],
  );
  const x = Number(widestBar.getAttribute("x"));
  return x + (getWidth(widestBar) * goalValue) / maxValue;
}

function getWidth(element: HTMLElement) {
  return Number(element.getAttribute("width"));
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
    .filter((element) => {
      return element.getAttribute("aria-roledescription") === roleDescription;
    });
}
