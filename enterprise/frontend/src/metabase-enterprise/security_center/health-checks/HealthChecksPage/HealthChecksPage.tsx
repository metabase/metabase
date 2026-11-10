import { useEffect } from "react";
import { c, t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Button, Group, Icon, Stack, Text, Title } from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { HealthCheck, HealthCheckStatus } from "metabase-types/api";

import { trackHealthChecksPageViewed } from "../../analytics";
import { HealthCheckGroup } from "../HealthCheckGroup/HealthCheckGroup";
import { HealthChecksSummary } from "../HealthChecksSummary/HealthChecksSummary";
import { useHealthChecks } from "../hooks/use-health-checks";
import { getChecksByStatus, getOldestCheckedAt } from "../utils";

const GROUP_ORDER: HealthCheckStatus[] = ["fail", "unknown", "pass"];

type HealthChecksContentProps = {
  checks: HealthCheck[];
  isLoading: boolean;
  error: unknown;
};

const HealthChecksContent = ({
  checks,
  isLoading,
  error,
}: HealthChecksContentProps) => {
  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (checks.length === 0) {
    return <EmptyState message={t`No health checks apply to this instance.`} />;
  }

  return (
    <Stack gap="xxl">
      <HealthChecksSummary checks={checks} />
      <Stack gap="lg">
        {GROUP_ORDER.map((status) => (
          <HealthCheckGroup
            key={status}
            status={status}
            checks={getChecksByStatus(checks, status)}
          />
        ))}
      </Stack>
    </Stack>
  );
};

export const HealthChecksPage = () => {
  const { checks, isLoading, error, recheckAll, isRecheckingAll } =
    useHealthChecks();
  const hasChecks = !error && checks.length > 0;

  useEffect(() => {
    trackHealthChecksPageViewed();
  }, []);

  return (
    <Stack gap="lg" data-testid="health-checks-page">
      <Group gap="sm" justify="space-between">
        <Title order={1}>{t`Health checks`}</Title>
        {hasChecks && (
          <Group gap="sm">
            <Text size="sm" c="text-secondary">
              {c("{0} is a relative time like 5 minutes ago")
                .t`Checked ${getRelativeTime(getOldestCheckedAt(checks))}`}
            </Text>
            <Button
              variant="subtle"
              leftSection={<Icon name="sync" />}
              loading={isRecheckingAll}
              onClick={recheckAll}
            >
              {t`Re-check`}
            </Button>
          </Group>
        )}
      </Group>
      <HealthChecksContent
        checks={checks}
        isLoading={isLoading}
        error={error}
      />
    </Stack>
  );
};
