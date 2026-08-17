import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetDatabaseHealthQuery } from "metabase/api";
import { Badge, Flex, type FlexProps, Text, Tooltip, rem } from "metabase/ui";
import type { DatabaseConnectionType, DatabaseId } from "metabase-types/api";

interface DatabaseConnectionHealthInfoProps extends FlexProps {
  databaseId: DatabaseId;
  connectionType?: DatabaseConnectionType;
  displayText?: "inline" | "tooltip";
}

export const DatabaseConnectionHealthInfo = ({
  databaseId,
  displayText = "inline",
  connectionType = "default",
  ...props
}: DatabaseConnectionHealthInfoProps) => {
  const healthQuery = useGetDatabaseHealthQuery({
    id: databaseId,
    "connection-type": connectionType,
  });
  const health = useMemo(() => {
    return match(healthQuery)
      .with(
        { currentData: { status: "ok" } },
        () => ({ message: t`Connected`, color: "positive" }) as const,
      )
      .with(
        { isUninitialized: true },
        { isFetching: true },
        { isLoading: true },
        () =>
          ({
            message: t`Loading...`,
            color: "neutral",
          }) as const,
      )
      .with(
        { currentData: { status: "error" } },
        (q) =>
          ({
            message: q.currentData.message,
            color: "negative",
          }) as const,
      )
      .with(
        { isError: true },
        () =>
          ({
            message: t`Failed to retrieve database health status.`,
            color: "neutral",
          }) as const,
      )
      .exhaustive();
  }, [healthQuery]);

  return (
    <Flex gap="sm" {...props} data-testid="database-connection-health-info">
      <Flex py={rem(6)}>
        <Tooltip label={health.message}>
          <Badge flex="0 0 auto" indicator color={health.color} />
        </Tooltip>
      </Flex>
      {displayText === "inline" && <Text lh="1.4">{health.message}</Text>}
    </Flex>
  );
};
