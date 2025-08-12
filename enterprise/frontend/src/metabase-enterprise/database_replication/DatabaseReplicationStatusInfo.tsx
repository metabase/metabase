import { memo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Badge, Flex, type FlexProps, Text, Tooltip } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

interface DatabaseReplicationStatusInfoProps extends FlexProps {
  databaseId: DatabaseId;
}

export const DatabaseReplicationStatusInfo = memo(
  function DatabaseReplicationStatusInfo({
    databaseId,
    ...flexProps
  }: DatabaseReplicationStatusInfoProps) {
    const connections = useSetting("database-replication-connections");
    const hasConnection = connections?.[databaseId] != null;

    const { message, color } = hasConnection
      ? { message: t`Replicating`, color: "success" }
      : ({ message: t`Not replicating`, color: "text-light" } as const);

    return (
      <Flex align="center" gap="sm" {...flexProps}>
        <Tooltip label={message}>
          <Badge size="12" circle bg={color} style={{ flexShrink: 0 }} />
        </Tooltip>
        <Text lh="1.4">{message}</Text>
      </Flex>
    );
  },
);
