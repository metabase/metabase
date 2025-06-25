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
  isLhsExpression: boolean;
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
    isLhsExpression,
    isOpened,
    isReadOnly,
    onClick,
  }: JoinColumnButtonProps,
  ref: Ref<HTMLButtonElement>,
) {
  const expression = isLhsExpression ? lhsExpression : rhsExpression;
  const expressionInfo = useMemo(
    () =>
      expression ? Lib.displayInfo(query, stageIndex, expression) : undefined,
    [query, stageIndex, expression],
  );
  const isEmpty = expression == null;

  return (
    <button
      className={cx(S.JoinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: !isEmpty,
        [S.noColumnStyle]: isEmpty,
        [S.isOpen]: isOpened,
      })}
      ref={ref}
      disabled={isReadOnly}
      onClick={onClick}
      aria-label={isLhsExpression ? t`Left column` : t`Right column`}
    >
      {tableName != null && (
        <Text
          display="block"
          fz={11}
          lh={1}
          color={isEmpty ? "brand" : "text-white"}
          ta="left"
          fw={400}
        >
          {tableName}
        </Text>
      )}
      <Text
        display="block"
        color={isEmpty ? "brand" : "text-white"}
        ta="left"
        fw={700}
        lh={1}
      >
        {expressionInfo?.displayName ?? t`Pick a column…`}
      </Text>
    </button>
  );
});
