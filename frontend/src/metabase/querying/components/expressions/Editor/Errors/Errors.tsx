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
}: {
  error?: ExpressionError | Error | null;
  source?: string;
}) {
  if (!error) {
    return null;
  }

  const position =
    source != null && isExpressionError(error) && error.pos != null
      ? getLineAndColumn(source, error.pos)
      : null;

  return (
    <Flex p="sm" className={S.errors} gap="sm" align="center">
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
