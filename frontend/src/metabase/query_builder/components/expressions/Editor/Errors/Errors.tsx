import type { ExpressionError } from "metabase/querying/expressions";
import { Flex, Icon } from "metabase/ui";

import S from "./Errors.module.css";

export function Errors({ error }: { error?: ExpressionError | Error | null }) {
  if (!error) {
    return null;
  }

  return (
    <Flex p="sm" className={S.errors} gap="sm" align="center">
      <Icon name="warning" className={S.icon} />
      {error.message}
    </Flex>
  );
}
