import { useCallback, useMemo } from "react";
import { t } from "ttag";

import ErrorBoundary from "metabase/ErrorBoundary";
import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import { ClauseStep } from "metabase/querying/notebook/components/ClauseStep";
import * as Lib from "metabase-lib";

const STAGE_INDEX = -1;

type MeasureAggregationPickerProps = {
  query: Lib.Query;
  onChange: (query: Lib.Query) => void;
  readOnly?: boolean;
};

export function MeasureAggregationPicker({
  query,
  onChange,
  readOnly = false,
}: MeasureAggregationPickerProps) {
  const aggregations = useMemo(
    () => Lib.aggregations(query, STAGE_INDEX),
    [query],
  );

  const operators = useMemo(() => {
    const baseOperators = Lib.availableAggregationOperators(query, STAGE_INDEX);
    if (aggregations.length > 0) {
      return Lib.selectedAggregationOperators(baseOperators, aggregations[0]);
    }
    return baseOperators;
  }, [query, aggregations]);

  const renderAggregationName = useCallback(
    (aggregation: Lib.AggregationClause) =>
      Lib.displayInfo(query, STAGE_INDEX, aggregation).longDisplayName,
    [query],
  );

  const handleQueryChange = useCallback(
    (newQuery: Lib.Query) => {
      onChange(newQuery);
    },
    [onChange],
  );

  const handleReorderAggregation = useCallback(
    (
      sourceClause: Lib.AggregationClause,
      targetClause: Lib.AggregationClause,
    ) => {
      const nextQuery = Lib.swapClauses(
        query,
        STAGE_INDEX,
        sourceClause,
        targetClause,
      );
      onChange(nextQuery);
    },
    [query, onChange],
  );

  const handleRemoveAggregation = useCallback(
    (clause: Lib.AggregationClause) => {
      const nextQuery = Lib.removeClause(query, STAGE_INDEX, clause);
      onChange(nextQuery);
    },
    [query, onChange],
  );

  const hasAddButton = !readOnly && aggregations.length === 0;
  const hasRemoveButton = !readOnly;

  return (
    <ErrorBoundary>
      <ClauseStep
        items={aggregations}
        initialAddText={t`Pick an aggregation function`}
        readOnly={readOnly}
        color="summarize"
        isLastOpened={false}
        hasAddButton={hasAddButton}
        hasRemoveButton={hasRemoveButton}
        renderName={renderAggregationName}
        renderPopover={({ item: aggregation, index, onClose }) => (
          <AggregationPicker
            query={query}
            stageIndex={STAGE_INDEX}
            clause={aggregation}
            clauseIndex={index}
            operators={operators}
            allowCustomExpressions
            allowMetrics={false}
            onQueryChange={handleQueryChange}
            onClose={onClose}
            readOnly={readOnly}
          />
        )}
        onReorder={handleReorderAggregation}
        onRemove={handleRemoveAggregation}
        data-testid="measure-editor"
      />
    </ErrorBoundary>
  );
}
