import { useMemo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { ExpressionWidget } from "metabase/query_builder/components/expressions/ExpressionWidget";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type { NotebookStepProps } from "../../types";
import { ClauseStep } from "../ClauseStep";

export const ExpressionStep = ({
  color,
  updateQuery,
  isLastOpened,
  reportTimezone,
  readOnly,
  step,
}: NotebookStepProps): JSX.Element => {
  const { query, stageIndex } = step;
  const tc = useTranslateContent();
  const expressions = useMemo(
    () => Lib.expressions(query, stageIndex),
    [query, stageIndex],
  );

  const renderExpressionName = (expression: Lib.ExpressionClause) => {
    return tc(Lib.displayInfo(query, stageIndex, expression).longDisplayName);
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
        <ExpressionPopover
          query={query}
          stageIndex={stageIndex}
          expression={item}
          expressionIndex={expressionIndex}
          reportTimezone={reportTimezone}
          updateQuery={updateQuery}
          onClose={onClose}
          readOnly={readOnly}
        />
      )}
      isLastOpened={isLastOpened}
      onReorder={handleReorderExpression}
      onRemove={handleRemoveExpression}
    />
  );
};

type ExpressionPopoverProps = {
  query: Lib.Query;
  stageIndex: number;
  expression: Lib.ExpressionClause | undefined;
  expressionIndex: number | undefined;
  reportTimezone: string;
  updateQuery: (query: Lib.Query) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
};

function ExpressionPopover({
  query,
  stageIndex,
  expression,
  expressionIndex,
  reportTimezone,
  updateQuery,
  onClose,
  readOnly,
}: ExpressionPopoverProps) {
  const expressionInfo = useMemo(
    () =>
      expression ? Lib.displayInfo(query, stageIndex, expression) : undefined,
    [query, stageIndex, expression],
  );

  const availableColumns = useMemo(
    () => Lib.expressionableColumns(query, stageIndex, expressionIndex),
    [query, stageIndex, expressionIndex],
  );

  const handleChangeClause = (name: string, clause: Lib.ExpressionClause) => {
    const uniqueName = getUniqueClauseName(query, stageIndex, expression, name);
    const namedClause = Lib.withExpressionName(clause, uniqueName);
    const isUpdate = expression != null;

    if (isUpdate) {
      const nextQuery = Lib.replaceClause(
        query,
        stageIndex,
        expression,
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
  };

  return (
    <ExpressionWidget
      query={query}
      stageIndex={stageIndex}
      expressionIndex={expressionIndex}
      availableColumns={availableColumns}
      name={expressionInfo?.displayName}
      clause={expression}
      withName
      onChangeClause={handleChangeClause}
      reportTimezone={reportTimezone}
      onClose={onClose}
      readOnly={readOnly}
    />
  );
}

const getUniqueClauseName = (
  query: Lib.Query,
  stageIndex: number,
  clause: Lib.ExpressionClause | undefined,
  name: string,
) => {
  const isUpdate = clause != null;
  // exclude the current clause so that it can be updated without renaming
  const queryWithoutCurrentClause = isUpdate
    ? Lib.removeClause(query, stageIndex, clause)
    : query;
  const expressions = Lib.expressions(queryWithoutCurrentClause, stageIndex);
  const expressionsObject = Object.fromEntries(
    expressions.map((expression) => [
      Lib.displayInfo(query, stageIndex, expression).displayName,
    ]),
  );
  const uniqueName = getUniqueExpressionName(expressionsObject, name);
  return uniqueName;
};
