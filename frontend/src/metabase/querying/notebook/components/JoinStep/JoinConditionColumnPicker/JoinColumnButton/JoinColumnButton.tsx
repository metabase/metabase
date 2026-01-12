import cx from "classnames";
import { type Ref, forwardRef, useMemo } from "react";
import { t } from "ttag";

import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./JoinColumnButton.module.css";

type JoinColumnButtonProps = {
  query: Lib.Query;
  stageIndex: number;
  tableName: string | undefined;
  lhsExpression: Lib.ExpressionClause | undefined;
  rhsExpression: Lib.ExpressionClause | undefined;
  isLhsPicker: boolean;
  isOpened: boolean;
  isReadOnly: boolean;
  onClick: () => void;
};

export const JoinColumnButton = forwardRef(function JoinColumnTarget(
  {
    query,
    stageIndex,
    tableName,
    lhsExpression,
    rhsExpression,
    isLhsPicker,
    isOpened,
    isReadOnly,
    onClick,
  }: JoinColumnButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const expression = isLhsPicker ? lhsExpression : rhsExpression;
  const buttonLabel = useMemo(
    () => getButtonLabel(query, stageIndex, expression),
    [query, stageIndex, expression],
  );
  const isEmpty = expression == null;
  const isLiteral =
    expression != null && Lib.isJoinConditionLHSorRHSLiteral(expression);

  return (
    <button
      className={cx(S.joinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: !isEmpty,
        [S.noColumnStyle]: isEmpty,
        [S.isOpen]: isOpened,
      })}
      ref={ref}
      disabled={isReadOnly}
      onClick={onClick}
      aria-label={isLhsPicker ? t`Left column` : t`Right column`}
    >
      {tableName != null && !isLiteral && (
        <Text
          display="block"
          fz={11}
          lh={1}
          c={isEmpty ? "brand" : "text-primary-inverse"}
          ta="left"
          fw={400}
        >
          {tableName}
        </Text>
      )}
      <Text
        className={S.joinCellContent}
        display="block"
        c={isEmpty ? "brand" : "text-primary-inverse"}
        ta="left"
        fw={700}
        lh={1}
      >
        {buttonLabel}
      </Text>
    </button>
  );
});

function getButtonLabel(
  query: Lib.Query,
  stageIndex: number,
  expression: Lib.ExpressionClause | undefined,
) {
  if (expression == null) {
    return t`Pick a column…`;
  }

  if (
    Lib.isJoinConditionLHSorRHSLiteral(expression) ||
    Lib.isJoinConditionLHSorRHSColumn(expression)
  ) {
    return Lib.displayInfo(query, stageIndex, expression).displayName;
  }

  return t`Custom expression`;
}
