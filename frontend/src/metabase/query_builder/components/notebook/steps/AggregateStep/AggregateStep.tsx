import { useMemo } from "react";
import { t } from "ttag";
import { AggregationPicker } from "metabase/common/components/AggregationPicker";
import * as Lib from "metabase-lib";
import type StructuredQuery from "metabase-lib/queries/StructuredQuery";
import type { NotebookStepUiComponentProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

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

  const clauses = useMemo(() => {
    return Lib.aggregations(topLevelQuery, stageIndex);
  }, [topLevelQuery, stageIndex]);

  const handleAddAggregation = (aggregation: Lib.Aggregable) => {
    const nextQuery = Lib.aggregate(topLevelQuery, stageIndex, aggregation);
    updateQuery(nextQuery);
  };

  const handleUpdateAggregation = (
    currentClause: Lib.AggregationClause,
    nextClause: Lib.Aggregable,
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
      renderPopover={({ item: aggregation, index }) => (
        <AggregationPopover
          query={topLevelQuery}
          legacyQuery={legacyQuery}
          stageIndex={stageIndex}
          clause={aggregation}
          clauseIndex={index}
          onAddAggregation={handleAddAggregation}
          onUpdateAggregation={handleUpdateAggregation}
        />
      )}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
      withLegacyPopover
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

  legacyQuery: StructuredQuery;
  clauseIndex?: number;

  // Implicitly passed by metabase/components/Triggerable
  onClose?: () => void;
}

function AggregationPopover({
  query,
  stageIndex,
  clause,
  clauseIndex,
  legacyQuery,
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
      legacyQuery={legacyQuery}
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
