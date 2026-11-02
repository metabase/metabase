import { useEffect, useState } from "react";
import { t } from "ttag";

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
import type { HealthCheck } from "metabase-types/api";

import {
  trackAllHealthChecksRecheckClicked,
  trackHealthChecksPageViewed,
} from "../../analytics";
import {
  useListHealthChecksQuery,
  useRecheckHealthChecksMutation,
} from "../../api";

import { HealthCheckCard } from "./HealthCheckCard";
import { groupHealthChecks } from "./utils";

type HealthCheckGroupProps = {
  title: string;
  checks: HealthCheck[];
  isDefaultOpened: boolean;
};

const HealthCheckGroup = ({
  title,
  checks,
  isDefaultOpened,
}: HealthCheckGroupProps) => {
  const [isOpened, setIsOpened] = useState(isDefaultOpened);

  if (checks.length === 0) {
    return null;
  }

  return (
    <Box>
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
            <HealthCheckCard key={check.id} check={check} />
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
  const [recheckAll, { isLoading: isRechecking }] =
    useRecheckHealthChecksMutation();
  const [sendToast] = useToast();

  useEffect(() => {
    trackHealthChecksPageViewed();
  }, []);

  const handleRecheckAll = async () => {
    trackAllHealthChecksRecheckClicked();
    try {
      await recheckAll().unwrap();
    } catch {
      sendToast({
        variant: "negative",
        message: t`Failed to re-check. Please try again.`,
      });
    }
  };

  const { failing, unknown, passed } = groupHealthChecks(data?.checks ?? []);

  return (
    <Stack gap="lg" data-testid="health-checks-page">
      <Group gap="sm" justify="space-between" align="center">
        <Title order={1}>{t`Health checks`}</Title>
        <Button
          variant="subtle"
          leftSection={
            isRechecking ? <Loader size="xs" /> : <Icon name="sync" />
          }
          disabled={isRechecking || !data}
          onClick={handleRecheckAll}
        >
          {t`Re-check all`}
        </Button>
      </Group>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <Stack gap="lg">
          <HealthChecksSummary
            passedCount={passed.length}
            totalCount={data?.checks.length ?? 0}
          />
          <HealthCheckGroup
            title={t`Failing`}
            checks={failing}
            isDefaultOpened
          />
          <HealthCheckGroup
            title={t`Couldn't check`}
            checks={unknown}
            isDefaultOpened={false}
          />
          <HealthCheckGroup
            title={t`Passed`}
            checks={passed}
            isDefaultOpened={false}
          />
        </Stack>
      </LoadingAndErrorWrapper>
    </Stack>
  );
};
