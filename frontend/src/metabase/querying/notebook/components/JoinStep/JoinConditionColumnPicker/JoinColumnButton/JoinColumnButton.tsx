import cx from "classnames";
import { type Ref, forwardRef, useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import { useLocale } from "metabase/common/hooks";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { useMergedRef } from "metabase/hooks/use-merged-ref";
import { useTranslateContent } from "metabase/i18n/hooks";
import type { ContentTranslationFunction } from "metabase/i18n/types";
import { isTouchDevice } from "metabase/lib/browser";
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
  const { locale } = useLocale();
  const expression = isLhsPicker ? lhsExpression : rhsExpression;
  const buttonLabel = useMemo(
    () => getButtonLabel(query, stageIndex, expression, tc, locale),
    [query, stageIndex, expression, tc, locale],
  );
  const isEmpty = expression == null;
  const isLiteral =
    expression != null && Lib.isJoinConditionLHSorRHSLiteral(expression);

  const [setRef, buttonRef] = useMergedRef<HTMLButtonElement>(ref);

  const wasOpened = usePrevious(isOpened);

  useEffect(() => {
    // On mobile devices for SDK/EAJS we scroll to opened dropdown,
    // as depending on a consumer site CSS the anchor button of the opened dropdown
    // may be horizontally out of the screen.
    // Only scroll on auto-open (true from mount), not user click.
    // If the user clicked the button, they can already see it.
    const isAutoOpened = isOpened && wasOpened === undefined;
    const isMobileEmbeddingSdk = isEmbeddingSdk() && isTouchDevice();

    if (isAutoOpened && buttonRef.current && isMobileEmbeddingSdk) {
      buttonRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "start",
        block: "nearest",
      });
    }
  }, [isOpened, wasOpened, buttonRef]);

  return (
    <button
      className={cx(S.joinCellItem, {
        [S.isReadOnly]: isReadOnly,
        [S.hasColumnStyle]: !isEmpty,
        [S.noColumnStyle]: isEmpty,
        [S.isOpen]: isOpened,
      })}
      ref={setRef}
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
