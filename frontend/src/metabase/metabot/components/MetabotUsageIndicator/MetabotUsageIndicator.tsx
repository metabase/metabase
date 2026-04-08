import { t } from "ttag";

import { useMetabotUsage } from "metabase/metabot/hooks";
import type { PoolUsageScope, UsageScope } from "metabase/metabot/hooks/use-metabot-usage";
import {
  Box,
  Group,
  Indicator,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import S from "./MetabotUsageIndicator.module.css";

function getColor(scope: UsageScope): string {
  if (scope.isAtLimit) {
    return "error";
  }
  if (scope.isNearLimit) {
    return "warning";
  }
  return "brand";
}

function formatResetRate(rate: string): string {
  switch (rate) {
    case "daily":
      return t`Resets daily`;
    case "weekly":
      return t`Resets weekly`;
    case "monthly":
      return t`Resets monthly`;
    default:
      return "";
  }
}

function formatUsageText(
  scope: UsageScope,
  unit: string | null,
): string {
  if (unit === "messages") {
    return t`${scope.usage} / ${scope.limit} messages used`;
  }
  return t`${scope.usage} / ${scope.limit} tokens used`;
}

function UsageBar({
  label,
  scope,
  unit,
}: {
  label: string;
  scope: UsageScope;
  unit: string | null;
}) {
  return (
    <Box>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Text size="xs" c="text-tertiary">
          {`${scope.percent}%`}
        </Text>
      </Group>
      <Progress
        value={scope.percent}
        size={6}
        color={getColor(scope)}
        aria-label={label}
      />
      <Text size="xs" c="text-tertiary" mt={4}>
        {formatUsageText(scope, unit)}
      </Text>
    </Box>
  );
}

interface MetabotUsageIndicatorProps {
  variant: "compact" | "detailed";
}

export function MetabotUsageIndicator({
  variant,
}: MetabotUsageIndicatorProps) {
  const { user, pool, mostConstrained, limitUnit, resetRate } =
    useMetabotUsage();

  if (!mostConstrained) {
    return null;
  }

  if (variant === "compact") {
    const otherScope = mostConstrained === user ? pool : user;
    const showSecondaryWarning = otherScope?.isNearLimit ?? false;

    return (
      <Tooltip label={formatUsageText(mostConstrained, limitUnit)}>
        <Indicator
          disabled={!showSecondaryWarning}
          color="warning"
          size={6}
          offset={-2}
        >
          <Box className={S.compactRoot}>
            <Progress
              value={mostConstrained.percent}
              size={4}
              color={getColor(mostConstrained)}
              aria-label={t`AI usage`}
            />
          </Box>
        </Indicator>
      </Tooltip>
    );
  }

  return (
    <Stack className={S.detailedRoot} gap="md">
      {user && (
        <UsageBar label={t`Your usage`} scope={user} unit={limitUnit} />
      )}
      {pool && (
        <UsageBar
          label={
            pool.scope === "tenant"
              ? t`Organization pool`
              : t`Instance pool`
          }
          scope={pool}
          unit={limitUnit}
        />
      )}
      {resetRate && (
        <Text size="xs" c="text-tertiary">
          {formatResetRate(resetRate)}
        </Text>
      )}
    </Stack>
  );
}
