import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  Anchor,
  Badge,
  type BadgeColor,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Icon,
  List,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";

import {
  useAcknowledgeHealthCheckMutation,
  useListHealthChecksQuery,
  useRecheckHealthCheckMutation,
  useRecheckHealthChecksMutation,
  useUnacknowledgeHealthCheckMutation,
} from "../../api";
import type { HealthCheck, HealthCheckStatus } from "../../types";

const POLLING_INTERVAL_MS = 2000;

const isAcknowledged = (check: HealthCheck) => check.acknowledged_at !== null;

const groupChecks = (checks: HealthCheck[]) => ({
  failing: checks.filter((c) => c.status === "fail" && !isAcknowledged(c)),
  unknown: checks.filter((c) => c.status === "unknown" && !isAcknowledged(c)),
  acknowledged: checks.filter((c) => c.status !== "pass" && isAcknowledged(c)),
  passed: checks.filter((c) => c.status === "pass"),
});

const getStatusColor = (status: HealthCheckStatus): BadgeColor =>
  match(status)
    .with("fail", () => "negative" as const)
    .with("unknown", () => "warning" as const)
    .with("pass", () => "positive" as const)
    .exhaustive();

const getStatusLabel = (status: HealthCheckStatus) =>
  match(status)
    .with("fail", () => t`Failing`)
    .with("unknown", () => t`Couldn't check`)
    .with("pass", () => t`Passing`)
    .exhaustive();

const getSummary = ({
  failingCount,
  unknownCount,
  totalCount,
}: {
  failingCount: number;
  unknownCount: number;
  totalCount: number;
}) => {
  const failing = t`${failingCount} of ${totalCount} checks fail`;
  return unknownCount > 0
    ? t`${failing}, ${unknownCount} couldn't be checked`
    : failing;
};

type HealthCheckCardProps = {
  check: HealthCheck;
  onAcknowledge: (checkId: string) => void;
  onUnacknowledge: (checkId: string) => void;
};

const HealthCheckCard = ({
  check,
  onAcknowledge,
  onUnacknowledge,
}: HealthCheckCardProps) => {
  const [recheck, { isLoading: isRechecking }] =
    useRecheckHealthCheckMutation();

  return (
    <Card p="xl" withBorder data-testid="health-check-card">
      <Stack gap="md">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Group gap="sm">
            <Badge color={getStatusColor(check.status)} size="sm">
              {getStatusLabel(check.status)}
            </Badge>
            {check.requires_restart && check.status !== "pass" && (
              <Badge color="neutral" size="sm">{t`Requires a restart`}</Badge>
            )}
          </Group>
          {check.running ? (
            <Text size="sm" c="text-secondary">{t`Checking…`}</Text>
          ) : (
            <Tooltip label={new Date(check.checked_at).toLocaleString()}>
              <Text size="sm" c="text-secondary">
                {t`Checked ${getRelativeTime(check.checked_at)} (${check.ms} ms)`}
              </Text>
            </Tooltip>
          )}
        </Group>
        <Title order={4}>{check.title}</Title>
        <Text c="text-secondary">{check.description}</Text>
        {check.reason && <Text c="text-secondary">{check.reason}</Text>}
        {check.details && check.details.length > 0 && (
          <List size="sm">
            {check.details.map((detail) => (
              <List.Item key={detail}>{detail}</List.Item>
            ))}
          </List>
        )}
        {check.databases && check.databases.length > 0 && (
          <List size="sm">
            {check.databases.map((db) => (
              <List.Item key={db.database}>
                <Tooltip
                  label={t`${db.ms ?? 0} ms`}
                  disabled={db.ms === undefined}
                >
                  <span>
                    {`${db.database}: ${getStatusLabel(db.status)}`}
                    {db.reason ? ` (${db.reason})` : ""}
                  </span>
                </Tooltip>
              </List.Item>
            ))}
          </List>
        )}
        {check.status !== "pass" && (
          <Box>
            <Text fw={700} mb="xxs">{t`How to fix`}</Text>
            <Text c="text-secondary">{check.remediation}</Text>
          </Box>
        )}
        {check.acknowledged_by && (
          <Text size="sm" c="text-secondary">
            {t`Acknowledged by ${check.acknowledged_by.common_name}`}
          </Text>
        )}
        <Group gap="lg">
          {check.status !== "pass" && !isAcknowledged(check) && (
            <Button onClick={() => onAcknowledge(check.id)}>
              {t`Acknowledge`}
            </Button>
          )}
          {isAcknowledged(check) && (
            <Button onClick={() => onUnacknowledge(check.id)}>
              {t`Undo acknowledge`}
            </Button>
          )}
          <Button
            variant="subtle"
            leftSection={
              isRechecking ? <Loader size="1rem" /> : <Icon name="sync" />
            }
            disabled={isRechecking}
            onClick={() => recheck(check.id)}
          >
            {t`Re-check`}
          </Button>
          <Anchor
            href={check.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {t`Docs`}
          </Anchor>
        </Group>
      </Stack>
    </Card>
  );
};

type CheckGroupProps = Omit<HealthCheckCardProps, "check"> & {
  title: string;
  checks: HealthCheck[];
  defaultOpened: boolean;
};

const CheckGroup = ({
  title,
  checks,
  defaultOpened,
  ...cardProps
}: CheckGroupProps) => {
  const [opened, setOpened] = useState(defaultOpened);

  if (checks.length === 0) {
    return null;
  }

  return (
    <Box>
      <UnstyledButton onClick={() => setOpened(!opened)} mb="md">
        <Group gap="sm" align="center">
          <Icon name={opened ? "chevrondown" : "chevronright"} />
          <Badge size="sm">{checks.length}</Badge>
          <Title order={4}>{title}</Title>
        </Group>
      </UnstyledButton>
      <Collapse in={opened}>
        <Stack gap="md">
          {checks.map((check) => (
            <HealthCheckCard key={check.id} check={check} {...cardProps} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
};

export const HealthChecksPage = () => {
  const [isRunning, setIsRunning] = useState(false);
  const { data: checks = [], isLoading } = useListHealthChecksQuery(undefined, {
    pollingInterval: isRunning ? POLLING_INTERVAL_MS : 0,
  });
  const [recheck, { isLoading: isRechecking }] =
    useRecheckHealthChecksMutation();
  const [acknowledge] = useAcknowledgeHealthCheckMutation();
  const [unacknowledge] = useUnacknowledgeHealthCheckMutation();

  const anyRunning = checks.some((check) => check.running);
  if (anyRunning !== isRunning) {
    setIsRunning(anyRunning);
  }

  const groups = groupChecks(checks);
  const allClear =
    checks.length > 0 &&
    groups.failing.length === 0 &&
    groups.unknown.length === 0 &&
    groups.acknowledged.length === 0;

  const cardProps = {
    onAcknowledge: (checkId: string) => acknowledge(checkId),
    onUnacknowledge: (checkId: string) => unacknowledge(checkId),
  };

  return (
    <Stack gap="lg" data-testid="health-checks-page">
      <Group gap="sm" align="center">
        <Title order={1}>{t`Health checks`}</Title>
        <Box style={{ flex: 1 }} />
        <Button
          variant="subtle"
          leftSection={
            isRechecking || anyRunning ? (
              <Loader size="1rem" />
            ) : (
              <Icon name="sync" />
            )
          }
          disabled={isRechecking || anyRunning}
          onClick={() => recheck()}
        >
          {t`Re-check all`}
        </Button>
      </Group>
      {isLoading ? (
        <Loader />
      ) : (
        <>
          <Card p="lg" withBorder>
            <Group gap="sm">
              <Icon
                name={allClear ? "check_filled" : "warning_triangle_filled"}
                c={allClear ? "feedback-positive" : "feedback-negative"}
              />
              <Text fw={700}>
                {allClear
                  ? t`All security checks pass`
                  : getSummary({
                      failingCount: groups.failing.length,
                      unknownCount: groups.unknown.length,
                      totalCount: checks.length,
                    })}
              </Text>
            </Group>
          </Card>
          <CheckGroup
            title={t`Failing`}
            checks={groups.failing}
            defaultOpened
            {...cardProps}
          />
          <CheckGroup
            title={t`Couldn't check`}
            checks={groups.unknown}
            defaultOpened={false}
            {...cardProps}
          />
          <CheckGroup
            title={t`Acknowledged`}
            checks={groups.acknowledged}
            defaultOpened={false}
            {...cardProps}
          />
          <CheckGroup
            title={t`Passed`}
            checks={groups.passed}
            defaultOpened={false}
            {...cardProps}
          />
        </>
      )}
    </Stack>
  );
};
