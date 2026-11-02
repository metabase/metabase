import { useEffect } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Group, Stack, Title } from "metabase/ui";
import type { HealthCheck } from "metabase-types/api";

import {
  trackHealthCheckRecheckClicked,
  trackHealthChecksPageViewed,
} from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthChecksMutation,
} from "../../api";

import { HealthCheckGroup } from "./HealthCheckGroup";
import { HealthChecksSummary } from "./HealthChecksSummary";
import { RecheckButton } from "./RecheckButton";
import { useRecheckErrorToast } from "./use-recheck-error-toast";
import {
  HEALTH_CHECK_STATUSES,
  RECHECK_ALL_CACHE_KEY,
  getChecksByStatus,
} from "./utils";

type HealthChecksContentProps = {
  checks: HealthCheck[];
  isError: boolean;
};

const HealthChecksContent = ({ checks, isError }: HealthChecksContentProps) => {
  if (isError) {
    return (
      <EmptyState
        icon="warning_triangle_filled"
        message={t`Something went wrong loading health checks.`}
      />
    );
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
  const { data, isLoading, isError } = useListHealthChecksQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const [recheckAll, { isLoading: isRecheckingAll }] =
    useRecheckHealthChecksMutation({ fixedCacheKey: RECHECK_ALL_CACHE_KEY });
  const showRecheckError = useRecheckErrorToast();
  const checks = data?.checks ?? [];

  useEffect(() => {
    trackHealthChecksPageViewed();
  }, []);

  const handleRecheckAll = async () => {
    trackHealthCheckRecheckClicked("all");
    const { error } = await recheckAll();
    if (error) {
      showRecheckError();
    }
  };

  return (
    <Stack gap="lg" data-testid="health-checks-page">
      <Group gap="sm" justify="space-between">
        <Title order={1}>{t`Health checks`}</Title>
        <RecheckButton
          variant="subtle"
          isRechecking={isRecheckingAll}
          isDisabled={checks.length === 0}
          onClick={handleRecheckAll}
        >
          {t`Re-check all`}
        </RecheckButton>
      </Group>
      <LoadingAndErrorWrapper loading={isLoading}>
        <HealthChecksContent checks={checks} isError={isError} />
      </LoadingAndErrorWrapper>
    </Stack>
  );
};
