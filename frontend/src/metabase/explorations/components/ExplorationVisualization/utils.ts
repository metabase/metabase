import { TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD } from "metabase/explorations/constants";
import type {
  Dataset,
  ExplorationDocument,
  ExplorationQuery,
  ExplorationThread,
  TimelineId,
} from "metabase-types/api";

/**
 * Pick the columns to use as `graph.dimensions` for an exploration query.
 * Matches the heuristic used by `Lib.defaultDisplay`: when the dataset has
 * three columns we treat the layout as date + breakout + metric and pin the
 * date as the x-axis and the breakout as the series, otherwise we let the
 * viz layer infer the dimensions.
 *
 * Shared between `ExplorationVisualization` (single query) and
 * `ExplorationGroupVisualization` (multi-query `page` group) so both render
 * with consistent dimension assignments.
 */
export function getDimensions(dataset: Dataset): string[] | undefined {
  const cols = dataset.data.cols;
  if (cols.length === 3) {
    // The first column is the date column and should be the x-axis;
    // the second column is the breakout. Provide them explicitly,
    // otherwise viz settings might swap them based on cardinality.
    return [cols[0]?.name, cols[1]?.name].filter(
      (name): name is string => typeof name === "string",
    );
  }
  return undefined;
}

/**
 * Aggregates `timeline_interestingness` across queries by taking the max
 * score per timeline. Used by group pages so a timeline counts as
 * interesting if any sub-query finds it interesting.
 *
 * Queries without `timeline_interestingness` (BE may omit the field) and
 * entries with `null` scores are ignored.
 */
export function getMaxTimelineInterestingness(
  queries: ExplorationQuery[],
): Map<TimelineId, number> {
  const map = new Map<TimelineId, number>();
  for (const q of queries) {
    for (const e of q.timeline_interestingness ?? []) {
      if (e.interestingness_score == null) {
        continue;
      }
      const prev = map.get(e.timeline_id);
      if (prev == null || e.interestingness_score > prev) {
        map.set(e.timeline_id, e.interestingness_score);
      }
    }
  }
  return map;
}

/**
 * Set of timeline ids whose max-aggregated score across `queries` passes
 * the global interestingness threshold (see `metabase/explorations/constants`).
 * Used by `TimelineDropdown` to decide which items get the
 * `PotentiallyInterestingMarker`.
 */
export function getInterestingTimelineIds(
  queries: ExplorationQuery[],
): ReadonlySet<TimelineId> {
  const result = new Set<TimelineId>();
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (score >= TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      result.add(id);
    }
  }
  return result;
}

/**
 * Picks the most-interesting timeline for `queries` restricted to the
 * timelines actually available in the dropdown. Returns `null` when no
 * candidate passes the threshold or when no scored timeline is available.
 *
 * Drives the auto-default selection on threads where the user hasn't
 * manually picked a timeline yet.
 */
export function getMostInterestingTimelineId(
  queries: ExplorationQuery[],
  availableTimelineIds: ReadonlySet<TimelineId>,
): TimelineId | null {
  if (availableTimelineIds.size === 1) {
    const id = availableTimelineIds.values().next().value;
    if (id) {
      return id;
    }
  }

  let best: { id: TimelineId; score: number } | null = null;
  for (const [id, score] of getMaxTimelineInterestingness(queries)) {
    if (!availableTimelineIds.has(id)) {
      continue;
    }
    if (score < TIMELINE_INTERESTINGNESS_SCORE_THRESHOLD) {
      continue;
    }
    if (best == null || score > best.score) {
      best = { id, score };
    }
  }
  return best?.id ?? null;
}

export function getDocumentsForDocumentMenu(
  explorationThread: ExplorationThread,
): ExplorationDocument[] {
  return (explorationThread.documents ?? []).filter(
    (d) => d.id !== explorationThread.auto_insights_document_id,
  );
}
