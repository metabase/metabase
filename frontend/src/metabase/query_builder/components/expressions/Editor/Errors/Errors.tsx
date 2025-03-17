import { Flex, Icon } from "metabase/ui";
import type { ErrorWithMessage } from "metabase-lib/v1/expressions";

import S from "./Errors.module.css";

export function Errors({ error }: { error?: ErrorWithMessage | Error | null }) {
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
