import type { CardKind } from "./layout-engine";

/**
 * Classify a card's KIND — what it IS, structurally — from facts we can read off the rendered result and
 * its display type. This is the deterministic half of the "what is this card for" judgment: display type
 * + row count settle almost every case. (Ambiguous ties and a "is this really a callout" probability are
 * where Jev would weigh in; kept deterministic here so the layout is instant and offline-safe.)
 */

/** The minimal shape facts the classifier needs — gathered from the rendered dashcard result. */
export interface CardShape {
  /** The visualization display, e.g. "scalar", "line", "bar", "table", "text". */
  display: string | null | undefined;
  /** Number of result rows, when the card has run. */
  rowCount?: number;
  /** Number of columns in the result. */
  colCount?: number;
}

const CALLOUT_DISPLAYS = new Set([
  "scalar",
  "smartscalar",
  "gauge",
  "progress",
]);
const TREND_DISPLAYS = new Set(["line", "area", "combo", "waterfall"]);
const COMPARISON_DISPLAYS = new Set([
  "bar",
  "row",
  "pie",
  "funnel",
  "sankey",
  "map",
]);
const TEXT_DISPLAYS = new Set(["text", "heading", "link", "iframe", "action"]);

export function classifyKind(shape: CardShape): CardKind {
  const display = shape.display ?? "";

  if (TEXT_DISPLAYS.has(display)) {
    return "text";
  }
  if (CALLOUT_DISPLAYS.has(display)) {
    return "callout";
  }
  if (TREND_DISPLAYS.has(display)) {
    return "trend";
  }
  if (COMPARISON_DISPLAYS.has(display)) {
    return "comparison";
  }
  if (display === "table" || display === "pivot") {
    // A one-row, few-column table is really a KPI readout — treat it as a callout.
    const isSingleValue =
      (shape.rowCount ?? 0) <= 1 && (shape.colCount ?? 99) <= 2;
    return isSingleValue ? "callout" : "table";
  }
  return "other";
}
