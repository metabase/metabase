import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type ExpressionError,
  getLineAndColumn,
  isExpressionError,
} from "metabase/querying/expressions";
import { Flex, Icon, Text } from "metabase/ui";

import S from "./Errors.module.css";

export function Errors({
  error,
  source,
  action,
  note,
}: {
  error?: ExpressionError | Error | null;
  source?: string;
  /** Shown at the end of the bar, for example a button that fixes the error. */
  action?: ReactNode;
  /** Shown on its own line below the error. */
  note?: ReactNode;
}) {
  if (!error) {
    return null;
  }

  const position =
    source != null && isExpressionError(error) && error.pos != null
      ? getLineAndColumn(source, error.pos)
      : null;

  return (
    <Flex p="sm" className={S.errors} gap="sm" align="center" wrap="wrap">
      <Icon name="warning" className={S.icon} />
      {error.message}
      {position && (
        <Text component="span" className={S.position}>
          {t`Line ${position.line}, Column ${position.column}`}
        </Text>
      )}
      {action != null && (
        <Flex ml="auto" align="center" className={S.action}>
          {action}
        </Flex>
      )}
      {note != null && <div className={S.note}>{note}</div>}
    </Flex>
  );
}
