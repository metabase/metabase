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
        <AggregationPicker
          query={topLevelQuery}
          legacyQuery={legacyQuery}
          legacyClause={
            typeof index === "number"
              ? legacyQuery.aggregations()[index]
              : undefined
          }
          stageIndex={stageIndex}
          operators={
            aggregation
              ? Lib.selectedAggregationOperators(operators, aggregation)
              : operators
          }
          onSelect={newAggregation => {
            const isUpdate = aggregation != null;
            if (isUpdate) {
              handleUpdateAggregation(aggregation, newAggregation);
            } else {
              handleAddAggregation(newAggregation);
            }
          }}
          onSelectLegacy={newLegacyAggregation => {
            const isUpdate = aggregation != null && typeof index === "number";
            if (isUpdate) {
              updateQuery(
                legacyQuery.updateAggregation(index, newLegacyAggregation),
              );
            } else {
              updateQuery(legacyQuery.aggregate(newLegacyAggregation));
            }
          }}
        />
      )}
      onRemove={handleRemoveAggregation}
      data-testid="aggregate-step"
    />
  );
}
