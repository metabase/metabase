import { t } from "ttag";

import {
  type UsageScope,
  useMetabotUsage,
} from "metabase/metabot/hooks/use-metabot-usage";
import { Box, Group, Progress, Stack, Text } from "metabase/ui";

import S from "./MetabotUsageIndicator.module.css";
import { formatResetRate, formatUsageText, getColor } from "./utils";

export function DetailedUsageIndicator() {
  const { user, pool, limitUnit, resetRate } = useMetabotUsage();

  if (!user && !pool) {
    return null;
  }

  return (
    <Stack className={S.detailedRoot} gap="xs">
      {user && <UsageBar label={t`Your usage`} scope={user} unit={limitUnit} />}
      {pool && (
        <UsageBar
          label={
            pool.scope === "tenant" ? t`Organization pool` : t`Instance pool`
          }
          scope={pool}
          unit={limitUnit}
        />
      )}
      {resetRate && (
        <Text size="xs" c="text-tertiary" w="100%" ta="right">
          {formatResetRate(resetRate)}
        </Text>
      )}
    </Stack>
  );
}

type UsageBarProps = {
  label: string;
  scope: UsageScope;
  unit: string | null;
};

function UsageBar({ label, scope, unit }: UsageBarProps) {
  return (
    <Box>
      <Group justify="space-between" mb="xs">
        <Text size="xs" c="text-tertiary">
          {label}
        </Text>
        <Text size="xs" c="text-tertiary">
          {formatUsageText(scope, unit)}
        </Text>
      </Group>
      <Progress
        value={scope.percent}
        size={5}
        bd={`1px solid var(--mb-color-${getColor(scope)})`}
        color={getColor(scope)}
        aria-label={label}
        variant="filled"
      />
    </Box>
  );
}
