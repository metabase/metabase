import { type ReactNode, useState } from "react";

import * as Lib from "metabase-lib";

import { ExpressionBar } from "./ExpressionBar";

const ROWS_STAGE = 0;

interface FilterExpressionBarProps {
  query: Lib.Query;
  isAutoApply: boolean;
  openKey: number | null;
  onFold: () => void;
  onChange: (query: Lib.Query) => void;
}

/**
 * Each filtered stage has its own expression, separated by "then". Without
 * auto-apply, later stages' edits wait for the rows bar's Apply.
 */
export function FilterExpressionBar({
  query,
  isAutoApply,
  openKey,
  onFold,
  onChange,
}: FilterExpressionBarProps) {
  const [draftQuery, setDraftQuery] = useState<Lib.Query>();
  const [stageErrors, setStageErrors] = useState<
    Record<number, string | undefined>
  >({});
  const [baseQuery, setBaseQuery] = useState(query);
  if (baseQuery !== query) {
    setBaseQuery(query);
    setDraftQuery(undefined);
    setStageErrors({});
  }
  const summaryQuery = draftQuery ?? query;
  // Keep intermediate stages too: more than one summary can have filters.
  const filteredStages = Lib.stageIndexes(summaryQuery).filter(
    (stageIndex) =>
      stageIndex !== ROWS_STAGE &&
      Lib.filters(summaryQuery, stageIndex).length > 0,
  );

  const handleChange = (nextQuery: Lib.Query) =>
    onChange(Lib.dropEmptyStages(nextQuery));

  // Prototype: the Clear button removes the filters of every stage at once.
  const handleClear = () => {
    setDraftQuery(undefined);
    setStageErrors({});
    handleChange(removeAllFilters(query));
  };

  const trailing = filteredStages.reduceRight<ReactNode>(
    (trailing, stageIndex) => (
      <ExpressionBar
        key={stageIndex}
        query={summaryQuery}
        stageIndex={stageIndex}
        onChange={isAutoApply ? handleChange : setDraftQuery}
        onErrorChange={(error) =>
          setStageErrors((errors) =>
            errors[stageIndex] === error
              ? errors
              : { ...errors, [stageIndex]: error },
          )
        }
        isAutoApply={isAutoApply}
        isNested
        trailing={trailing}
      />
    ),
    undefined,
  );

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
      trailingError={filteredStages
        .map((stageIndex) => stageErrors[stageIndex])
        .find((error) => error != null)}
      trailing={trailing}
      onClear={handleClear}
    />
  );
}

function removeAllFilters(query: Lib.Query) {
  return Lib.stageIndexes(query).reduce(
    (query, stageIndex) =>
      Lib.filters(query, stageIndex).reduce(
        (query, filter) => Lib.removeClause(query, stageIndex, filter),
        query,
      ),
    query,
  );
}
