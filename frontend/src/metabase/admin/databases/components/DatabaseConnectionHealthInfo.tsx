import { useMemo } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { useGetDatabaseHealthQuery } from "metabase/api";
import { Badge, Flex, type FlexProps, Text, Tooltip } from "metabase/ui";
import type { DatabaseId } from "metabase-types/api";

interface DatabaseConnectionHealthInfoProps extends FlexProps {
  databaseId: DatabaseId;
  displayText?: "inline" | "tooltip";
}

export const DatabaseConnectionHealthInfo = ({
  databaseId,
  displayText = "inline",
  ...props
}: DatabaseConnectionHealthInfoProps) => {
  const healthQuery = useGetDatabaseHealthQuery(databaseId);
  const health = useMemo(() => {
    return match(healthQuery)
      .with(
        { currentData: { status: "ok" } },
        () => ({ message: t`Connected`, color: "success" }) as const,
      )
      .with(
        { isUninitialized: true },
        { isFetching: true },
        { isLoading: true },
        () => ({ message: t`Loading...`, color: "text-light" }) as const,
      )
      .with(
        { currentData: { status: "error" } },
        (q) => ({ message: q.currentData.message, color: "danger" }) as const,
      )
      .with(
        { isError: true },
        () =>
          ({
            message: t`Failed to retrieve database health status.`,
            color: "text-light",
          }) as const,
      )
      .exhaustive();
  }, [healthQuery]);

  return (
    <Flex align="center" gap="sm" {...props}>
      <Tooltip label={health.message}>
        <Badge size="12" circle bg={health.color} style={{ flexShrink: 0 }} />
      </Tooltip>
      {displayText === "inline" && <Text lh="1.4">{health.message}</Text>}
    </Flex>
  );
};
