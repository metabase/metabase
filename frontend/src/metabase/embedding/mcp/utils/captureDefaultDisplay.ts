import type { CardDisplayType, Dataset } from "metabase-types/api";

export interface DefaultDisplayState {
  defaultDisplay: CardDisplayType | null;

  queryKey: string | null;
  lastQueryResult: Dataset | null;
}

/**
 * Captures the display that Metabase picked as the default for a query.
 *
 * The default display comes from the SDK question lifecycle, which calls
 * `Lib.defaultDisplay` and applies other adjustments in the `Question` class.
 */
export function captureDefaultDisplay({
  currentDisplay,
  queryKey,
  queryResult,
  previousState,
}: {
  currentDisplay: CardDisplayType | null;
  queryKey: string | null;
  queryResult: Dataset | null;
  previousState: DefaultDisplayState;
}): DefaultDisplayState {
  const hasQueryChanged = previousState.queryKey !== queryKey;

  const hasQueryResultChanged =
    queryResult !== null && queryResult !== previousState.lastQueryResult;

  const previousDefaultDisplay = hasQueryChanged
    ? null
    : previousState.defaultDisplay;

  const isQueryResultFresh =
    queryResult !== null &&
    currentDisplay !== null &&
    (!hasQueryChanged || hasQueryResultChanged);

  // Only update the query key when the SDK query result caught up.
  // If we refresh the key too early, the next stale render will capture the old display for the new query.
  if (!isQueryResultFresh) {
    return {
      defaultDisplay: previousDefaultDisplay,
      queryKey: previousState.queryKey,
      lastQueryResult: previousState.lastQueryResult,
    };
  }

  // Ad-hoc questions in MCP Apps initializes as `table`.
  // Replace that placeholder when default display actually loads.
  // see `getMcpDeserializedCard` in `embedding/mcp/McpUiAppRoute.utils.ts`
  const shouldReplaceTablePlaceholder =
    previousDefaultDisplay === "table" && currentDisplay !== "table";

  // SDK only updates the question display *after* the query result arrives.
  // We replace the display when that happens.
  // see `runQuestionQuerySdk` in `sdk-question/run-question-query.ts`
  const defaultDisplay =
    previousDefaultDisplay === null || shouldReplaceTablePlaceholder
      ? currentDisplay
      : previousDefaultDisplay;

  return { defaultDisplay, queryKey, lastQueryResult: queryResult };
}
