import { isQuestionCard, isQuestionDashCard } from "metabase/utils/dashboard";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  ConcreteTableId,
  DashCardId,
  Dashboard,
  RowValues,
} from "metabase-types/api";

export type XrayChart = {
  id: DashCardId;
  card: Card;
};

/**
 * The table the gallery x-rays: the source table of a GUI question, or `null`
 * for native questions and questions built on other questions.
 */
export function getGalleryTableId(question: Question): ConcreteTableId | null {
  const query = question.query();
  if (Lib.queryDisplayInfo(query).isNative) {
    return null;
  }
  const sourceId = Lib.sourceTableOrCardId(query);
  return typeof sourceId === "number" ? sourceId : null;
}

/**
 * Search param holding the selected x-ray chart as `<tableId>-<position>`, with a 1-based
 * position in {@link getXrayCharts} order. X-rays are regenerated on every load, so the
 * position is the stable identifier; the table id keeps the selection from leaking into
 * another table's gallery.
 */
export const XRAY_SEARCH_PARAM = "xray";

/** The selected chart position for `tableId`, or `null` when `value` is absent, malformed, or for another table. */
export function parseXraySearchParam(
  value: string | null,
  tableId: ConcreteTableId,
): number | null {
  const match = value?.match(/^(\d+)-(\d+)$/);
  if (match == null || Number(match[1]) !== tableId) {
    return null;
  }
  const position = Number(match[2]);
  return position >= 1 ? position : null;
}

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
