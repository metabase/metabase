import { useMergedRef } from "@mantine/hooks";
import cx from "classnames";
import { type Ref, forwardRef, useMemo, useRef } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useLocale } from "metabase/common/hooks";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { Text } from "metabase/ui";
import { isTouchDevice } from "metabase/utils/browser";
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
  const { locale } = useLocale();
  const expression = isLhsPicker ? lhsExpression : rhsExpression;
  const buttonLabel = useMemo(
    () => getButtonLabel(query, stageIndex, expression, tc, locale),
    [query, stageIndex, expression, tc, locale],
  );
  const isEmpty = expression == null;
  const isLiteral =
    expression != null && Lib.isJoinConditionLHSorRHSLiteral(expression);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const mergedRef = useMergedRef(buttonRef, ref);

  useMount(() => {
    // On touch devices we scroll to the auto-opened dropdown,
    // as the anchor button of the opened dropdown may be horizontally out of the screen.
    if (isOpened && buttonRef.current && isTouchDevice()) {
      buttonRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
    }
  });

  return (
    <button
      className={cx(S.joinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: !isEmpty,
        [S.noColumnStyle]: isEmpty,
        [S.isOpen]: isOpened,
      })}
      ref={mergedRef}
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
  locale: string,
) {
  if (expression == null) {
    return t`Pick a column…`;
  }

  if (
    Lib.isJoinConditionLHSorRHSLiteral(expression) ||
    Lib.isJoinConditionLHSorRHSColumn(expression)
  ) {
    return PLUGIN_CONTENT_TRANSLATION.translateColumnDisplayName({
      displayName: Lib.displayInfo(query, stageIndex, expression).displayName,
      tc,
      locale,
    });
  }

  return t`Custom expression`;
}
