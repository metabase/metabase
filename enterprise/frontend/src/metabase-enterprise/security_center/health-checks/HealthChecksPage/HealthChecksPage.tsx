import { useEffect } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Button, Group, Icon, Stack, Title } from "metabase/ui";
import type { HealthCheck } from "metabase-types/api";

import { trackHealthChecksPageViewed } from "../../analytics";
import { HealthCheckGroup } from "../HealthCheckGroup/HealthCheckGroup";
import { HealthChecksSummary } from "../HealthChecksSummary/HealthChecksSummary";
import { HEALTH_CHECK_STATUSES } from "../constants";
import { useHealthChecks } from "../hooks/use-health-checks";
import { getChecksByStatus } from "../utils";

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
        {HEALTH_CHECK_STATUSES.map((status) => (
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
          <Button
            variant="subtle"
            leftSection={<Icon name="sync" />}
            loading={isRecheckingAll}
            onClick={recheckAll}
          >
            {t`Re-check all`}
          </Button>
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
