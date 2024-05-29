import { useMemo } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

export function AggregateStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const clauses = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);

  const handleAddAggregations = (aggregations: Lib.Aggregable[]) => {
    const nextQuery = aggregations.reduce(
      (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
      query,
    );
    updateQuery(nextQuery);
  };

  const handleUpdateAggregations = (
    currentClause: Lib.AggregationClause,
    nextClauses: Lib.Aggregable[],
  ) => {
    const [firstClause, ...remainingClauses] = nextClauses;
    const nextQuery = remainingClauses.reduce(
      (query, aggregation) => Lib.aggregate(query, stageIndex, aggregation),
      Lib.replaceClause(query, stageIndex, currentClause, firstClause),
    );

    updateQuery(nextQuery);
  };

  const handleReorderAggregation = (
    sourceClause: Lib.AggregationClause,
    targetClause: Lib.AggregationClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveAggregation = (clause: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  const renderAggregationName = (aggregation: Lib.AggregationClause) =>
    Lib.displayInfo(query, stageIndex, aggregation).longDisplayName;

  return (
    <ClauseStep
      items={clauses}
      initialAddText={t`Pick the metric you want to see`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      renderName={renderAggregationName}
      renderPopover={({ item: aggregation, index, onClose }) => (
        <AggregationPopover
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          onAddAggregations={handleAddAggregations}
          onUpdateAggregations={handleUpdateAggregations}
          onClose={onClose}
        />
      )}
      onReorder={handleReorderAggregation}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
    />
  );
}

interface AggregationPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  clause?: Lib.AggregationClause;
  onUpdateAggregations: (
    currentClause: Lib.AggregationClause,
    nextClauses: Lib.Aggregable[],
  ) => void;
  onAddAggregations: (aggregation: Lib.Aggregable[]) => void;

  clauseIndex?: number;

  onClose: () => void;
}

function AggregationPopover({
  query,
  stageIndex,
  clause,
  clauseIndex,
  onAddAggregations,
  onUpdateAggregations,
  onClose,
}: AggregationPopoverProps) {
  const isUpdate = clause != null && clauseIndex != null;

  const operators = useMemo(() => {
    const baseOperators = Lib.availableAggregationOperators(query, stageIndex);
    return isUpdate
      ? Lib.selectedAggregationOperators(baseOperators, clause)
      : baseOperators;
  }, [query, clause, stageIndex, isUpdate]);

  return (
    <AggregationPicker
      query={query}
      stageIndex={stageIndex}
      clause={clause}
      clauseIndex={clauseIndex}
      operators={operators}
      onSelect={aggregations => {
        if (isUpdate) {
          onUpdateAggregations(clause, aggregations);
        } else {
          onAddAggregations(aggregations);
        }
      }}
      onClose={onClose}
    />
  );
}
