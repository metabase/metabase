import { useState } from "react";

import * as Lib from "metabase-lib";

import { ExpressionBar } from "./ExpressionBar";
import { getSummaryStageIndex } from "./tokens";

const ROWS_STAGE = 0;

interface FilterExpressionBarProps {
  query: Lib.Query;
  isAutoApply: boolean;
  openKey: number | null;
  onFold: () => void;
  onChange: (query: Lib.Query) => void;
}

/**
 * Prototype: the rows' filters as one expression, with the summary's filters
 * as a bar of their own after a "then", so they can be or-ed too. Without
 * auto-apply the summary's edits wait for the rows bar's Apply, like its own
 * edits do.
 */
export function FilterExpressionBar({
  query,
  isAutoApply,
  openKey,
  onFold,
  onChange,
}: FilterExpressionBarProps) {
  const [draftQuery, setDraftQuery] = useState<Lib.Query>();
  const [summaryError, setSummaryError] = useState<string>();
  const [baseQuery, setBaseQuery] = useState(query);
  if (baseQuery !== query) {
    setBaseQuery(query);
    setDraftQuery(undefined);
  }
  const summaryQuery = draftQuery ?? query;
  const summaryStageIndex = getSummaryStageIndex(query);
  // Only with summary pills to show, so an empty bar still gets its placeholder.
  const showsSummaryBar =
    summaryStageIndex != null &&
    Lib.stageCount(summaryQuery) > summaryStageIndex &&
    Lib.filters(summaryQuery, summaryStageIndex).length > 0;

  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  return (
    <ExpressionBar
      query={query}
      stageIndex={ROWS_STAGE}
      onChange={handleChange}
      isAutoApply={isAutoApply}
      openKey={openKey}
      onFold={onFold}
      draftQuery={isAutoApply ? undefined : draftQuery}
      onDraftChange={isAutoApply ? handleChange : setDraftQuery}
      trailingError={showsSummaryBar ? summaryError : undefined}
      trailing={
        showsSummaryBar && (
          <ExpressionBar
            query={summaryQuery}
            stageIndex={summaryStageIndex}
            onChange={isAutoApply ? handleChange : setDraftQuery}
            onErrorChange={setSummaryError}
            isAutoApply={isAutoApply}
            isNested
          />
        )
      }
    />
  );
}
