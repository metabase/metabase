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
    const message = hasConnection
      ? // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
        t`Replicating to Metabase Cloud Storage`
      : // eslint-disable-next-line no-literal-metabase-strings -- This string only shows for admins.
        t`Not replicating to Metabase Cloud Storage`;
    const color = hasConnection ? "success" : "text-tertiary";

    return (
      <Flex align="center" gap="sm" {...flexProps}>
        <Tooltip label={message}>
          <Badge size="12" circle bg={color} style={{ flexShrink: 0 }} />
        </Tooltip>
        <Text lh="1.25rem">{message}</Text>
      </Flex>
    );
  },
);
