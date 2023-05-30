import { t } from "ttag";

import * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";

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
  query: legacyQuery,
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

  const handleAddAggregation = (aggregation: Lib.AggregationClause) => {
    const nextQuery = Lib.aggregate(topLevelQuery, stageIndex, aggregation);
    updateQuery(nextQuery);
  };

  const handleUpdateAggregation = (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.AggregationClause,
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
          legacyQuery={legacyQuery}
          onAddAggregation={handleAddAggregation}
          onUpdateAggregation={handleUpdateAggregation}
          onLegacyQueryChange={updateQuery}
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
    nextClause: Lib.AggregationClause,
  ) => void;
  onAddAggregation: (aggregation: Lib.AggregationClause) => void;

  legacyQuery: StructuredQuery;
  clauseIndex?: number;
  onLegacyQueryChange: (query: StructuredQuery) => void;
}

function AggregationPopover({
  query,
  stageIndex,
  operators: baseOperators,
  clause,
  clauseIndex,
  legacyQuery,
  onAddAggregation,
  onUpdateAggregation,
  onLegacyQueryChange,
}: AggregationPopoverProps) {
  const isUpdate = clause != null && clauseIndex != null;

  const operators = isUpdate
    ? Lib.selectedAggregationOperators(baseOperators, clause)
    : baseOperators;

  const legacyClause = isUpdate
    ? legacyQuery.aggregations()[clauseIndex]
    : undefined;

  return (
    <AggregationPicker
      query={query}
      legacyQuery={legacyQuery}
      legacyClause={legacyClause}
      stageIndex={stageIndex}
      operators={operators}
      onSelect={aggregation => {
        if (isUpdate) {
          onUpdateAggregation(clause, aggregation);
        } else {
          onAddAggregation(aggregation);
        }
      }}
      onSelectLegacy={newLegacyAggregation => {
        if (isUpdate) {
          onLegacyQueryChange(
            legacyQuery.updateAggregation(clauseIndex, newLegacyAggregation),
          );
        } else {
          onLegacyQueryChange(legacyQuery.aggregate(newLegacyAggregation));
        }
      }}
    />
  );
}
