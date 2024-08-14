import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { NotebookStepUiComponentProps } from "../types";

import { ClauseStep } from "./ClauseStep";

export const ExpressionStep = ({
  color,
  updateQuery,
  isLastOpened,
  reportTimezone,
  readOnly,
  step,
}: NotebookStepUiComponentProps): JSX.Element => {
  const { query, stageIndex } = step;
  const expressions = Lib.expressions(query, stageIndex);

  const renderExpressionName = (expression: Lib.ExpressionClause) => {
    return Lib.displayInfo(query, stageIndex, expression).longDisplayName;
  };

  const handleReorderExpression = (
    sourceClause: Lib.ExpressionClause,
    targetClause: Lib.ExpressionClause,
  ) => {
    const nextQuery = Lib.swapClauses(
      query,
      stageIndex,
      sourceClause,
      targetClause,
    );
    updateQuery(nextQuery);
  };

  const handleRemoveExpression = (clause: Lib.ExpressionClause) => {
    const nextQuery = Lib.removeClause(query, stageIndex, clause);
    updateQuery(nextQuery);
  };

  return (
    <ClauseStep
      color={color}
      items={expressions}
      renderName={renderExpressionName}
      readOnly={readOnly}
      renderPopover={({ item, index: expressionIndex, onClose }) => (
        <ExpressionWidget
          query={query}
          stageIndex={stageIndex}
          expressionIndex={expressionIndex}
          name={
            item
              ? Lib.displayInfo(query, stageIndex, item).displayName
              : undefined
          }
          clause={item}
          withName
          onChangeClause={(name, clause) => {
            const uniqueName = getUniqueClauseName(
              query,
              stageIndex,
              item,
              name,
            );
            const namedClause = Lib.withExpressionName(clause, uniqueName);
            const isUpdate = item;

            if (isUpdate) {
              const nextQuery = Lib.replaceClause(
                query,
                stageIndex,
                item,
                namedClause,
              );
              updateQuery(nextQuery);
            } else {
              const nextQuery = Lib.expression(
                query,
                stageIndex,
                uniqueName,
                namedClause,
              );
              updateQuery(nextQuery);
            }
          }}
          reportTimezone={reportTimezone}
          onClose={onClose}
        />
      )}
      isLastOpened={isLastOpened}
      onReorder={handleReorderExpression}
      onRemove={handleRemoveExpression}
    />
  );
};

const getUniqueClauseName = (
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | undefined,
  name: string,
) => {
  const isUpdate = clause;
  // exclude the current clause so that it can be updated without renaming
  const queryWithoutCurrentClause = isUpdate
    ? Lib.removeClause(query, stageIndex, clause)
    : query;
  const expressions = Lib.expressions(queryWithoutCurrentClause, stageIndex);
  const expressionsObject = Object.fromEntries(
    expressions.map(expression => [
      Lib.displayInfo(query, stageIndex, expression).displayName,
    ]),
  );
  const uniqueName = getUniqueExpressionName(expressionsObject, name);
  return uniqueName;
};
