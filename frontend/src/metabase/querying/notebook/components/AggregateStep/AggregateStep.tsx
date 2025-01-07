import { useMemo } from "react";
import { t } from "ttag";

import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import * as Lib from "metabase-lib";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

export function AggregateStep({
  query,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepProps) {
  const { question, stageIndex } = step;
  const isMetric = question.type() === "metric";

  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);

  const hasAddButton = !readOnly && (!isMetric || aggregations.length === 0);
  const hasRemoveButton = !readOnly && !isMetric;

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
      items={aggregations}
      initialAddText={t`Pick a function or metric`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      hasAddButton={hasAddButton}
      hasRemoveButton={hasRemoveButton}
      renderName={renderAggregationName}
      renderPopover={({ item: aggregation, index, onClose }) => (
        <AggregationPopover
          query={query}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          onQueryChange={updateQuery}
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
  clauseIndex?: number;
  onQueryChange: (query: Lib.Query) => void;
  onClose: () => void;
}

function AggregationPopover({
  query,
  stageIndex,
  clause,
  clauseIndex,
  onQueryChange,
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
      allowCustomExpressions
      onQueryChange={onQueryChange}
      onClose={onClose}
    />
  );
}
