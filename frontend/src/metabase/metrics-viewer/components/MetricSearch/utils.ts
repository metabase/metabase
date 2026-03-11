import type { ExpressionToken } from "../../types/operators";
import type { SelectedMetric } from "../../types/viewer-state";

export function getSelectedMetricIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "metric")
      .map((metric) => metric.id),
  );
}

export function getSelectedMeasureIds(
  selectedMetrics: SelectedMetric[],
): Set<number> {
  return new Set(
    selectedMetrics
      .filter((metric) => metric.sourceType === "measure")
      .map((metric) => metric.id),
  );
}

/**
 * Removes unnecessary parentheses from a token stream.
 * Parens are unnecessary when they contain 0 or 1 metric tokens (at any depth).
 * Runs repeatedly until no more cleanup is possible.
 */
export function cleanupParens(tokens: ExpressionToken[]): ExpressionToken[] {
  let current = tokens;
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < current.length; i++) {
      if (current[i].type !== "open-paren") {
        continue;
      }

      // Find the matching close-paren
      let depth = 1;
      let j = i + 1;
      while (j < current.length && depth > 0) {
        if (current[j].type === "open-paren") {
          depth++;
        } else if (current[j].type === "close-paren") {
          depth--;
        }
        j++;
      }

      if (depth !== 0) {
        // Unmatched open-paren — skip
        continue;
      }

      const closeIdx = j - 1;
      const content = current.slice(i + 1, closeIdx);
      const metricCount = content.filter((t) => t.type === "metric").length;

      if (metricCount <= 1) {
        current = [
          ...current.slice(0, i),
          ...content,
          ...current.slice(closeIdx + 1),
        ];
        changed = true;
        break;
      }
    }
  }

  return current;
}

type ExcludeMetric = {
  id: number;
  sourceType: "metric" | "measure";
};

type SearchResultLike = {
  id: number;
  model: "metric" | "measure";
};

export function filterSearchResults<T extends SearchResultLike>(
  results: T[],
  selectedMetricIds: Set<number>,
  selectedMeasureIds: Set<number>,
  excludeMetric?: ExcludeMetric,
): T[] {
  return results.filter(
    (result) =>
      (result.model === "metric"
        ? !selectedMetricIds.has(result.id)
        : !selectedMeasureIds.has(result.id)) &&
      (!excludeMetric ||
        result.id !== excludeMetric.id ||
        result.model !== excludeMetric.sourceType),
  );
}
