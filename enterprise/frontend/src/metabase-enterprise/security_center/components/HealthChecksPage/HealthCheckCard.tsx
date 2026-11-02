import { useState } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useDocsUrl, useToast } from "metabase/common/hooks";
import {
  Anchor,
  Badge,
  type BadgeColor,
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
import type { ColorName } from "metabase/ui/colors/types";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
  HealthCheckStatus,
  IconName,
} from "metabase-types/api";

import { trackHealthCheckRecheckClicked } from "../../analytics";
import { useRecheckHealthCheckMutation } from "../../api";

import { getHealthCheckItemUrl, splitHealthCheckItems } from "./utils";

const STATUS_BADGE_COLOR: Record<HealthCheckStatus, BadgeColor> = {
  fail: "negative",
  unknown: "warning",
  pass: "positive",
};

const STATUS_ICON: Record<HealthCheckStatus, IconName> = {
  fail: "warning_triangle_filled",
  unknown: "info",
  pass: "check_filled",
};

const STATUS_ICON_COLOR: Record<HealthCheckStatus, ColorName> = {
  fail: "feedback-negative",
  unknown: "text-secondary",
  pass: "feedback-positive",
};

const getStatusLabel = (status: HealthCheckStatus) =>
  ({
    fail: t`Failing`,
    unknown: t`Couldn't check`,
    pass: t`Passing`,
  })[status];

type HealthCheckItemRowProps = {
  checkId: HealthCheckId;
  item: HealthCheckItem;
};

const HealthCheckItemRow = ({ checkId, item }: HealthCheckItemRowProps) => {
  const url = getHealthCheckItemUrl(checkId, item);

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      data-testid="health-check-item"
    >
      <Icon
        name={STATUS_ICON[item.status]}
        c={STATUS_ICON_COLOR[item.status]}
        aria-label={getStatusLabel(item.status)}
      />
      <Box>
        {item.entity_name && url && (
          <Anchor component={Link} to={url} size="sm" fw="bold">
            {item.entity_name}
          </Anchor>
        )}
        {item.entity_name && !url && (
          <Text size="sm" fw="bold">
            {item.entity_name}
          </Text>
        )}
        {item.message && (
          <Text size="sm" c="text-secondary">
            {item.message}
          </Text>
        )}
      </Box>
    </Group>
  );
};

type HealthCheckItemsProps = {
  check: HealthCheck;
};

const HealthCheckItems = ({ check }: HealthCheckItemsProps) => {
  const [isPassedOpened, setIsPassedOpened] = useState(false);
  const { problems, passed } = splitHealthCheckItems(check.items);
  const passedCount = passed.length;

  return (
    <Stack gap="sm">
      {problems.map((item, index) => (
        <HealthCheckItemRow key={index} checkId={check.id} item={item} />
      ))}
      {passedCount > 0 && (
        <UnstyledButton
          aria-expanded={isPassedOpened}
          onClick={() => setIsPassedOpened(!isPassedOpened)}
        >
          <Group gap="xs">
            <Icon name={isPassedOpened ? "chevrondown" : "chevronright"} />
            <Text
              size="sm"
              c="text-secondary"
            >{t`Passed (${passedCount})`}</Text>
          </Group>
        </UnstyledButton>
      )}
      {isPassedOpened &&
        passed.map((item, index) => (
          <HealthCheckItemRow key={index} checkId={check.id} item={item} />
        ))}
    </Stack>
  );
};

type HealthCheckCardProps = {
  check: HealthCheck;
};

export const HealthCheckCard = ({ check }: HealthCheckCardProps) => {
  const [recheck, { isLoading: isRechecking }] =
    useRecheckHealthCheckMutation();
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(check.docs.page, {
    anchor: check.docs.anchor,
  });
  const [sendToast] = useToast();
  const isPassing = check.status === "pass";

  const handleRecheck = async () => {
    trackHealthCheckRecheckClicked(check.id);
    try {
      await recheck(check.id).unwrap();
    } catch {
      sendToast({
        variant: "negative",
        message: t`Failed to re-check. Please try again.`,
      });
    }
  };

  return (
    <Card p="xl" withBorder data-testid="health-check-card">
      <Stack gap="md">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Group gap="sm">
            <Badge color={STATUS_BADGE_COLOR[check.status]} size="sm">
              {getStatusLabel(check.status)}
            </Badge>
            {check.requires_restart && !isPassing && (
              <Badge color="neutral" size="sm">{t`Requires a restart`}</Badge>
            )}
          </Group>
          <Text size="sm" c="text-secondary">
            {t`Checked ${getRelativeTime(check.checked_at)}`}
          </Text>
        </Group>
        <Title order={4}>{check.title}</Title>
        <Text c="text-secondary">{check.description}</Text>
        <HealthCheckItems check={check} />
        {!isPassing && (
          <Box>
            <Text fw="bold" mb="xs">{t`How to fix`}</Text>
            <Text c="text-secondary">{check.remediation}</Text>
          </Box>
        )}
        <Group gap="lg">
          <Button
            variant="subtle"
            leftSection={
              isRechecking ? <Loader size="xs" /> : <Icon name="sync" />
            }
            disabled={isRechecking}
            onClick={handleRecheck}
          >
            {t`Re-check`}
          </Button>
          {showMetabaseLinks && (
            <Anchor
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              {t`Read the docs`}
            </Anchor>
          )}
        </Group>
      </Stack>
    </Card>
  );
};
