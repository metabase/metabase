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

  const handleAddAggregation = (aggregation: Lib.Aggregable) => {
    const nextQuery = Lib.aggregate(query, stageIndex, aggregation);
    updateQuery(nextQuery);
  };

  const handleUpdateAggregation = (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.Aggregable,
  ) => {
    const nextQuery = Lib.replaceClause(
      query,
      stageIndex,
      currentClause,
      nextClause,
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
          onAddAggregation={handleAddAggregation}
          onUpdateAggregation={handleUpdateAggregation}
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
  onUpdateAggregation: (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.Aggregable,
  ) => void;
  onAddAggregation: (aggregation: Lib.Aggregable) => void;

  clauseIndex?: number;

  onClose: () => void;
}

function AggregationPopover({
  query,
  stageIndex,
  clause,
  clauseIndex,
  onAddAggregation,
  onUpdateAggregation,
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
      clause={clause}
      stageIndex={stageIndex}
      operators={operators}
      onSelect={aggregation => {
        if (isUpdate) {
          onUpdateAggregation(clause, aggregation);
        } else {
          onAddAggregation(aggregation);
        }
      }}
      onClose={onClose}
    />
  );
}
