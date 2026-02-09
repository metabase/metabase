import cx from "classnames";
import { type Ref, forwardRef, useMemo } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/i18n/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
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
  const tc = useTranslateContent();
  const expression = isLhsPicker ? lhsExpression : rhsExpression;
  const buttonLabel = useMemo(
    () => getButtonLabel(query, stageIndex, expression, tc),
    [query, stageIndex, expression, tc],
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
          {tc(tableName)}
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
  tc: ContentTranslationFunction,
) {
  if (expression == null) {
    return t`Pick a column…`;
  }

  if (
    Lib.isJoinConditionLHSorRHSLiteral(expression) ||
    Lib.isJoinConditionLHSorRHSColumn(expression)
  ) {
    return PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName(
      Lib.displayInfo(query, stageIndex, expression).displayName,
      tc,
    );
  }

  return t`Custom expression`;
}
