import {
  isPivotDetailRow,
  isPivotGroupColumn,
} from "metabase/visualizations/lib/data_grid";
import { datasetContainsNoResults } from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

/**
 * Pivot-aware datasetContainsNoResults: a pivot always returns a grand-total row
 * via GROUPING SETS, so it has no results only when no row is a detail row.
 */
export function hasNoResults(
  data: Pick<DatasetData, "rows" | "cols">,
): boolean {
  if (datasetContainsNoResults(data)) {
    return true;
  }

  const pivotGroupingIndex = data.cols.findIndex(isPivotGroupColumn);
  if (pivotGroupingIndex === -1) {
    return false;
  }

  return !data.rows.some((row) => isPivotDetailRow(row, pivotGroupingIndex));
}

// Markdown that renders no text in the message, removed in this order: images
// (inline, with one level of parentheses in the URL or title, or by
// reference), links left empty once their images are gone, and link reference
// definitions.
const TEXTLESS_MARKDOWN = [
  /!\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)/g,
  /!\[[^\]]*\]\[[^\]]*\]/g,
  /\[\s*\]\((?:[^()]|\([^()]*\))*\)/g,
  /^ {0,3}\[[^\]]+\]:[ \t]*\S+(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gm,
];

const hasText = (markdown: string) =>
  TEXTLESS_MARKDOWN.reduce(
    (text, pattern) => text.replace(pattern, ""),
    markdown,
  ).trim() !== "";

/**
 * The author's Markdown no-results message, trimmed. A blank message, or one
 * made only of images (which the message never renders), counts as unset.
 */
export function getNoResultsMessage(
  settings: Pick<VisualizationSettings, "card.no_results_message">,
): string | undefined {
  const message = settings["card.no_results_message"]?.trim();
  return message && hasText(message) ? message : undefined;
}
