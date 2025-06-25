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
  const column = isLhsExpression ? lhsExpression : rhsExpression;
  const columnInfo = useMemo(
    () => (column ? Lib.displayInfo(query, stageIndex, column) : undefined),
    [query, stageIndex, column],
  );

  return (
    <button
      className={cx(S.JoinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: column != null,
        [S.noColumnStyle]: column == null,
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
          color={columnInfo ? "text-white" : "brand"}
          ta="left"
          fw={400}
        >
          {tableName}
        </Text>
      )}
      <Text
        display="block"
        color={columnInfo ? "text-white" : "brand"}
        ta="left"
        fw={700}
        lh={1}
      >
        {columnInfo?.displayName ?? t`Pick a column…`}
      </Text>
    </button>
  );
});
