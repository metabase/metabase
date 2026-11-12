import cx from "classnames";
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
  content,
  inline = false,
}: {
  error?: ExpressionError | Error | null;
  source?: string;
  /** Shown instead of the error. */
  content?: ReactNode;
  /** The style of the editor on the page: a plain row under the code. */
  inline?: boolean;
}) {
  if (!error) {
    return null;
  }
  if (content != null) {
    return (
      <Flex
        p={inline ? undefined : "sm"}
        className={cx(S.errors, { [S.inline]: inline })}
      >
        {content}
      </Flex>
    );
  }
  if (inline) {
    return (
      <div className={cx(S.errors, S.inline)} role="alert">
        <span className={S.title}>{t`Syntax error`}</span>
        <span className={S.message}>{error.message}</span>
      </div>
    );
  }

  const position =
    source != null && isExpressionError(error) && error.pos != null
      ? getLineAndColumn(source, error.pos)
      : null;

  return (
    <Flex p="sm" className={S.errors} gap="sm" align="flex-start" wrap="wrap">
      <Icon name="warning" className={S.icon} />
      {error.message}
      {position && (
        <Text component="span" className={S.position}>
          {t`Line ${position.line}, Column ${position.column}`}
        </Text>
      )}
    </Flex>
  );
}
