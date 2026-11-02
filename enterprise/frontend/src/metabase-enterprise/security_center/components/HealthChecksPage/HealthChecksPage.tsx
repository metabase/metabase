import { useEffect } from "react";
import { t } from "ttag";

import ShieldImage from "assets/img/shield-96x96.svg";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Accordion,
  Badge,
  Card,
  Group,
  Icon,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import type { HealthCheck, HealthCheckStatus } from "metabase-types/api";

import {
  trackHealthCheckRecheckClicked,
  trackHealthChecksPageViewed,
} from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthChecksMutation,
} from "../../api";

import { HealthCheckCard } from "./HealthCheckCard";
import S from "./HealthChecksPage.module.css";
import { RecheckButton } from "./RecheckButton";
import { useRecheckErrorToast } from "./use-recheck-error-toast";
import {
  HEALTH_CHECK_STATUSES,
  RECHECK_ALL_CACHE_KEY,
  getChecksByStatus,
  getStatusInfo,
} from "./utils";

type HealthCheckGroupProps = {
  status: HealthCheckStatus;
  checks: HealthCheck[];
};

const HealthCheckGroup = ({ status, checks }: HealthCheckGroupProps) => {
  if (checks.length === 0) {
    return null;
  }

  const { label, badgeColor } = getStatusInfo(status);

  return (
    <Accordion
      defaultValue={status === "fail" ? status : null}
      transitionDuration={0}
      classNames={{ content: S.groupContent }}
    >
      <Accordion.Item value={status}>
        <Accordion.Control
          icon={
            <Badge color={badgeColor} size="sm">
              {checks.length}
            </Badge>
          }
        >
          {label}
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="lg">
            {checks.map((check) => (
              <HealthCheckCard key={check.id} check={check} />
            ))}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

type HealthChecksSummaryProps = {
  checks: HealthCheck[];
};

const HealthChecksSummary = ({ checks }: HealthChecksSummaryProps) => {
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const isAllClear = passedCount === checks.length;

  if (isAllClear) {
    return (
      <Card p="xxl" withBorder>
        <Stack align="center" gap="lg">
          <img src={ShieldImage} alt="" />
          <Text fw="bold">{t`All security checks pass`}</Text>
        </Stack>
      </Card>
    );
  }

  const { icon, iconColor } = getStatusInfo("fail");

  return (
    <Card p="lg" withBorder>
      <Group gap="sm">
        <Icon name={icon} c={iconColor} />
        <Text fw="bold">{t`${passedCount} of ${checks.length} checks pass`}</Text>
      </Group>
    </Card>
  );
};

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
