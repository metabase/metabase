import { t } from "ttag";

import * as Lib from "metabase-lib";

import type { NotebookStepUiComponentProps } from "../../types";
import ClauseStep from "../ClauseStep";

import { AggregationPicker } from "./AggregateStep.styled";

const aggTetherOptions = {
  attachment: "top left",
  targetAttachment: "bottom left",
  offset: "0 10px",
  constraints: [
    {
      to: "scrollParent",
      attachment: "together",
    },
  ],
};

export function AggregateStep({
  topLevelQuery,
  step,
  color,
  isLastOpened,
  readOnly,
  updateQuery,
}: NotebookStepUiComponentProps) {
  const { stageIndex } = step;

  const clauses = Lib.aggregations(topLevelQuery, stageIndex);
  const operators = Lib.availableAggregationOperators(
    topLevelQuery,
    stageIndex,
  );

  const handleAddAggregation = (
    aggregation: Lib.AggregationClause | Lib.MetricMetadata,
  ) => {
    const nextQuery = Lib.aggregate(topLevelQuery, stageIndex, aggregation);
    updateQuery(nextQuery);
  };

  const handleUpdateAggregation = (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.AggregationClause | Lib.MetricMetadata,
  ) => {
    const nextQuery = Lib.replaceClause(
      topLevelQuery,
      stageIndex,
      currentClause,
      nextClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveAggregation = (aggregation: Lib.AggregationClause) => {
    const nextQuery = Lib.removeClause(topLevelQuery, stageIndex, aggregation);
    updateQuery(nextQuery);
  };

  const renderAggregationName = (aggregation: Lib.AggregationClause) =>
    Lib.displayInfo(topLevelQuery, stageIndex, aggregation).longDisplayName;

  return (
    <ClauseStep
      items={clauses}
      initialAddText={t`Pick the metric you want to see`}
      readOnly={readOnly}
      color={color}
      isLastOpened={isLastOpened}
      tetherOptions={aggTetherOptions}
      renderName={renderAggregationName}
      renderPopover={(aggregation, index) => (
        <AggregationPopover
          query={topLevelQuery}
          stageIndex={stageIndex}
          operators={operators}
          clause={aggregation}
          clauseIndex={index}
          onAddAggregation={handleAddAggregation}
          onUpdateAggregation={handleUpdateAggregation}
        />
      )}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
    />
  );
}

interface AggregationPopoverProps {
  query: Lib.Query;
  stageIndex: number;
  operators: Lib.AggregationOperator[];
  clause?: Lib.AggregationClause;
  onUpdateAggregation: (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.AggregationClause | Lib.MetricMetadata,
  ) => void;
  onAddAggregation: (
    aggregation: Lib.AggregationClause | Lib.MetricMetadata,
  ) => void;

  clauseIndex?: number;

  // Implicitly passed by metabase/components/Triggerable
  onClose?: () => void;
}

function AggregationPopover({
  query,
  stageIndex,
  operators: baseOperators,
  clause,
  clauseIndex,
  onAddAggregation,
  onUpdateAggregation,
  onClose,
}: AggregationPopoverProps) {
  const isUpdate = clause != null && clauseIndex != null;

  const operators = isUpdate
    ? Lib.selectedAggregationOperators(baseOperators, clause)
    : baseOperators;

  return (
    <AggregationPicker
      query={query}
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
