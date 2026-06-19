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

  const previousDefaultDisplay = hasQueryChanged
    ? null
    : previousState.defaultDisplay;

  const isQueryResultStale =
    hasQueryChanged && queryResult === previousState.lastQueryResult;

  // SDK only updates the question display *after* the query result arrives.
  // see `runQuestionQuerySdk` in `sdk-question/run-question-query.ts`
  const hasDefaultDisplayUpdated =
    queryResult !== null && currentDisplay !== null && !isQueryResultStale;

  // Ad-hoc questions in MCP Apps initializes as `table`.
  // Replace that placeholder when default display actually loads.
  // see `getMcpDeserializedCard` in `embedding/mcp/McpUiAppRoute.utils.ts`
  const shouldReplaceTablePlaceholder =
    previousDefaultDisplay === "table" && currentDisplay !== "table";

  const shouldReplaceCurrentDisplay =
    hasDefaultDisplayUpdated &&
    (previousDefaultDisplay === null || shouldReplaceTablePlaceholder);

  return {
    defaultDisplay: shouldReplaceCurrentDisplay
      ? currentDisplay
      : previousDefaultDisplay,

    queryKey,
    lastQueryResult: queryResult,
  };
}
