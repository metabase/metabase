import type { CardDisplayType } from "metabase-types/api";

export type RequestedDisplayAction =
  /** This query's results haven't settled yet — check again on the next render. */
  | "wait"
  /** Set the requested display and stop tracking this query. */
  | "apply"
  /** Nothing to do, but stop tracking this query. */
  | "settle";

/**
 * What to do with the chart type `visualize_query` asked for.
 *
 * The tool's `display` is a one-shot request, not a binding. It is honored once
 * per query, and only after that query's own results have landed — applying it
 * earlier would lock a display against the previous query's data. Once honored
 * the query is marked settled even when no change was needed, so the user
 * picking a different chart type afterwards is never overridden.
 */
export function getRequestedDisplayAction({
  requestedDisplay,
  currentDisplay,
  defaultDisplay,
  queryKey,
  settledQueryKey,
}: {
  requestedDisplay: CardDisplayType | null;
  currentDisplay: CardDisplayType | null;
  /** Set once the SDK has settled on a display for this query's results. */
  defaultDisplay: CardDisplayType | null;
  queryKey: string | null;
  /** The query whose request was already honored, if any. */
  settledQueryKey: string | null;
}): RequestedDisplayAction {
  if (!requestedDisplay || settledQueryKey === queryKey) {
    return "settle";
  }

  if (defaultDisplay === null) {
    return "wait";
  }

  return currentDisplay === requestedDisplay ? "settle" : "apply";
}
