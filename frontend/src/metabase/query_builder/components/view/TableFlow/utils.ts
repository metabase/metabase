import { isQuestionCard, isQuestionDashCard } from "metabase/utils/dashboard";
import type {
  Card,
  DashCardId,
  Dashboard,
  RowValues,
} from "metabase-types/api";

export type XrayChart = {
  id: DashCardId;
  card: Card;
};

/**
 * Returns the chart-backed cards of an x-ray dashboard in layout order,
 * skipping text/heading cards. Dashcard-level settings override card-level ones.
 */
export function getXrayCharts(dashboard: Dashboard | undefined): XrayChart[] {
  if (!dashboard) {
    return [];
  }

  return dashboard.dashcards
    .filter(isQuestionDashCard)
    .filter((dashcard) => isQuestionCard(dashcard.card))
    .sort(
      (a, b) =>
        (a.dashboard_tab_id ?? 0) - (b.dashboard_tab_id ?? 0) ||
        a.row - b.row ||
        a.col - b.col,
    )
    .map((dashcard) => ({
      id: dashcard.id,
      card: {
        ...dashcard.card,
        visualization_settings: {
          ...dashcard.card.visualization_settings,
          ...dashcard.visualization_settings,
        },
      },
    }));
}

export type RowSearchResult = {
  rows: RowValues[];
  /** Index of each returned row in the unfiltered rows. */
  sourceIndexes: number[];
};

/**
 * Case-insensitive match of `searchText` against the raw value of every cell.
 * Returns `null` when the search text is blank so callers can keep the original rows.
 */
export function searchRows(
  rows: readonly RowValues[],
  searchText: string,
): RowSearchResult | null {
  const term = searchText.trim().toLowerCase();
  if (term.length === 0) {
    return null;
  }

  const result: RowSearchResult = { rows: [], sourceIndexes: [] };
  rows.forEach((row, index) => {
    const isMatch = row.some(
      (value) => value != null && String(value).toLowerCase().includes(term),
    );
    if (isMatch) {
      result.rows.push(row);
      result.sourceIndexes.push(index);
    }
  });
  return result;
}
