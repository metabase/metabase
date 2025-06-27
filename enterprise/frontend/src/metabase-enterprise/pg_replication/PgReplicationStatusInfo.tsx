import { useMemo } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Badge, Flex, type FlexProps, Text, Tooltip } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

type PgReplicationConnections = Record<DatabaseId, { connection_id: string }>;

interface PgReplicationStatusInfoProps extends FlexProps {
  databaseId: DatabaseId;
  displayText?: "inline" | "tooltip";
}

export const PgReplicationStatusInfo = ({
  databaseId,
  displayText = "inline",
  ...props
}: PgReplicationStatusInfoProps) => {
  const connections = useSetting("pg-replication-connections") as
    | PgReplicationConnections
    | undefined;

  const status = useMemo(() => {
    const hasConnection = connections?.[databaseId] != null;

    if (hasConnection) {
      return { message: t`Replicating`, color: "success" } as const;
    } else {
      return { message: t`Not replicating`, color: "text-light" } as const;
    }
  }, [connections, databaseId]);

  return (
    <Flex align="center" gap="sm" {...props}>
      <Tooltip label={status.message}>
        <Badge size="12" circle bg={status.color} style={{ flexShrink: 0 }} />
      </Tooltip>
      {displayText === "inline" && <Text lh="1.4">{status.message}</Text>}
    </Flex>
  );
};
