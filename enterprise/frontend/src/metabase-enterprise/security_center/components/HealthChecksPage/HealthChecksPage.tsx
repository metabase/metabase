import { useEffect, useState } from "react";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "metabase/ui";
import type { HealthCheck, HealthCheckId } from "metabase-types/api";

import {
  trackAllHealthChecksRecheckClicked,
  trackHealthCheckRecheckClicked,
  trackHealthChecksPageViewed,
} from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthCheckMutation,
  useRecheckHealthChecksMutation,
} from "../../api";

import { HealthCheckCard } from "./HealthCheckCard";
import { groupHealthChecks } from "./utils";

type HealthCheckGroupProps = {
  title: string;
  checks: HealthCheck[];
  isDefaultOpened: boolean;
  recheckingCheckIds: ReadonlySet<HealthCheckId>;
  isRecheckingAll: boolean;
  onRecheck: (checkId: HealthCheckId) => void;
};

const HealthCheckGroup = ({
  title,
  checks,
  isDefaultOpened,
  recheckingCheckIds,
  isRecheckingAll,
  onRecheck,
}: HealthCheckGroupProps) => {
  const [isOpened, setIsOpened] = useState(isDefaultOpened);

  if (checks.length === 0) {
    return null;
  }

  return (
    <Box component="section" aria-label={title}>
      <UnstyledButton
        aria-expanded={isOpened}
        mb="md"
        onClick={() => setIsOpened(!isOpened)}
      >
        <Group gap="sm" align="center">
          <Icon name={isOpened ? "chevrondown" : "chevronright"} />
          <Badge size="sm">{checks.length}</Badge>
          <Title order={4}>{title}</Title>
        </Group>
      </UnstyledButton>
      {isOpened && (
        <Stack gap="md">
          {checks.map((check) => (
            <HealthCheckCard
              key={check.id}
              check={check}
              isRechecking={recheckingCheckIds.has(check.id)}
              isRecheckDisabled={
                isRecheckingAll || recheckingCheckIds.has(check.id)
              }
              onRecheck={onRecheck}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
};

type HealthChecksSummaryProps = {
  passedCount: number;
  totalCount: number;
};

const HealthChecksSummary = ({
  passedCount,
  totalCount,
}: HealthChecksSummaryProps) => {
  const isAllClear = passedCount === totalCount;

  return (
    <Card p="lg" withBorder>
      <Group gap="sm">
        <Icon
          name={isAllClear ? "check_filled" : "warning_triangle_filled"}
          c={isAllClear ? "feedback-positive" : "feedback-negative"}
        />
        <Text fw="bold">
          {isAllClear
            ? t`All security checks pass`
            : t`${passedCount} of ${totalCount} checks pass`}
        </Text>
      </Group>
    </Card>
  );
};

export const HealthChecksPage = () => {
  const { data, isLoading, error } = useListHealthChecksQuery();
  const [recheck] = useRecheckHealthCheckMutation();
  const [recheckAll, { isLoading: isRecheckingAll }] =
    useRecheckHealthChecksMutation();
  const [recheckingCheckIds, setRecheckingCheckIds] = useState<
    ReadonlySet<HealthCheckId>
  >(new Set());
  const [sendToast] = useToast();

  useEffect(() => {
    trackHealthChecksPageViewed();
  }, []);

  const showRecheckError = () =>
    sendToast({
      variant: "negative",
      message: t`Failed to re-check. Please try again.`,
    });

  const handleRecheck = async (checkId: HealthCheckId) => {
    trackHealthCheckRecheckClicked(checkId);
    setRecheckingCheckIds((ids) => new Set(ids).add(checkId));
    try {
      await recheck(checkId).unwrap();
    } catch {
      showRecheckError();
    } finally {
      setRecheckingCheckIds((ids) => {
        const nextIds = new Set(ids);
        nextIds.delete(checkId);
        return nextIds;
      });
    }
  };

  const handleRecheckAll = async () => {
    trackAllHealthChecksRecheckClicked();
    try {
      await recheckAll().unwrap();
    } catch {
      showRecheckError();
    }
  };

  const checks = data?.checks ?? [];
  const { failing, unknown, passed } = groupHealthChecks(checks);
  const isRechecking = isRecheckingAll || recheckingCheckIds.size > 0;
  const groupProps = {
    recheckingCheckIds,
    isRecheckingAll,
    onRecheck: handleRecheck,
  };

  return (
    <Stack gap="lg" data-testid="health-checks-page">
      <Group gap="sm" justify="space-between" align="center">
        <Title order={1}>{t`Health checks`}</Title>
        <Button
          variant="subtle"
          leftSection={
            isRecheckingAll ? <Loader size="xs" /> : <Icon name="sync" />
          }
          disabled={isRechecking || checks.length === 0}
          onClick={handleRecheckAll}
        >
          {t`Re-check all`}
        </Button>
      </Group>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        {checks.length === 0 ? (
          <EmptyState message={t`No health checks apply to this instance.`} />
        ) : (
          <Stack gap="lg">
            <HealthChecksSummary
              passedCount={passed.length}
              totalCount={checks.length}
            />
            <HealthCheckGroup
              title={t`Failing`}
              checks={failing}
              isDefaultOpened
              {...groupProps}
            />
            <HealthCheckGroup
              title={t`Couldn't check`}
              checks={unknown}
              isDefaultOpened={false}
              {...groupProps}
            />
            <HealthCheckGroup
              title={t`Passed`}
              checks={passed}
              isDefaultOpened={false}
              {...groupProps}
            />
          </Stack>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
};
