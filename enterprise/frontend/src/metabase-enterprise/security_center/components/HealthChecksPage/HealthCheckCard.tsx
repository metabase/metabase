import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl } from "metabase/common/hooks";
import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { isResourceNotFoundError } from "metabase/utils/errors";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
} from "metabase-types/api";

import { trackHealthCheckRecheckClicked } from "../../analytics";
import {
  useRecheckHealthCheckMutation,
  useRecheckHealthChecksMutation,
} from "../../api";
import { SeverityBadge } from "../SeverityBadge/SeverityBadge";

import S from "./HealthCheckCard.module.css";
import { RecheckButton } from "./RecheckButton";
import { useRecheckErrorToast } from "./use-recheck-error-toast";
import {
  RECHECK_ALL_CACHE_KEY,
  getHealthCheckItemUrl,
  getHealthCheckSettingsUrl,
  getStatusInfo,
  partitionItemsByProblem,
} from "./utils";

const ROW_LINE_HEIGHT = "1.25rem";

type HealthCheckItemRowProps = {
  checkId: HealthCheckId;
  item: HealthCheckItem;
};

const HealthCheckItemRow = ({ checkId, item }: HealthCheckItemRowProps) => {
  const { label, icon, iconColor } = getStatusInfo(item.status);
  const url = getHealthCheckItemUrl(checkId, item);

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      px="lg"
      py="sm"
      data-testid="health-check-item"
    >
      <Flex h={ROW_LINE_HEIGHT} align="center">
        <FixedSizeIcon name={icon} c={iconColor} aria-label={label} />
      </Flex>
      <Stack gap="xxs" miw={0}>
        {item.entity_name &&
          (url ? (
            <Anchor component={Link} to={url} fw="bold" lh={ROW_LINE_HEIGHT}>
              {item.entity_name}
            </Anchor>
          ) : (
            <Text fw="bold" lh={ROW_LINE_HEIGHT}>
              {item.entity_name}
            </Text>
          ))}
        {item.message && (
          <Text c="text-secondary" lh={ROW_LINE_HEIGHT}>
            {item.message}
          </Text>
        )}
      </Stack>
    </Group>
  );
};

type HealthCheckItemRowsProps = {
  checkId: HealthCheckId;
  items: HealthCheckItem[];
};

const HealthCheckItemRows = ({ checkId, items }: HealthCheckItemRowsProps) =>
  items.map((item, index) => (
    <HealthCheckItemRow key={index} checkId={checkId} item={item} />
  ));

type HealthCheckItemsProps = {
  check: HealthCheck;
};

const HealthCheckItems = ({ check }: HealthCheckItemsProps) => {
  const [problemItems, passedItems] = partitionItemsByProblem(check.items);
  const isPassedCollapsed = problemItems.length > 0 && passedItems.length > 0;

  return (
    <Card withBorder p={0} className={S.itemList}>
      <HealthCheckItemRows
        checkId={check.id}
        items={
          isPassedCollapsed ? problemItems : [...problemItems, ...passedItems]
        }
      />
      {isPassedCollapsed && (
        <PassedItems checkId={check.id} items={passedItems} />
      )}
    </Card>
  );
};

const PassedItems = ({ checkId, items }: HealthCheckItemRowsProps) => {
  const { icon, iconColor } = getStatusInfo("pass");

  return (
    <Accordion
      radius={0}
      transitionDuration={0}
      classNames={{ content: S.passedContent }}
    >
      <Accordion.Item value="passed">
        <Accordion.Control icon={<FixedSizeIcon name={icon} c={iconColor} />}>
          {t`Passed (${items.length})`}
        </Accordion.Control>
        <Accordion.Panel>
          <HealthCheckItemRows checkId={checkId} items={items} />
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
};

type HealthCheckCardProps = {
  check: HealthCheck;
};

export const HealthCheckCard = ({ check }: HealthCheckCardProps) => {
  const [recheck, { isLoading: isRechecking }] =
    useRecheckHealthCheckMutation();
  const [, { isLoading: isRecheckingAll }] = useRecheckHealthChecksMutation({
    fixedCacheKey: RECHECK_ALL_CACHE_KEY,
  });
  const showRecheckError = useRecheckErrorToast();
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(check.docs.page, {
    anchor: check.docs.anchor,
  });
  const isFailing = check.status === "fail";
  const settingsUrl = isFailing ? getHealthCheckSettingsUrl(check.id) : null;

  const handleRecheck = async () => {
    trackHealthCheckRecheckClicked(check.id);
    const { error } = await recheck(check.id);
    if (error && !isResourceNotFoundError(error)) {
      showRecheckError();
    }
  };

  return (
    <Card
      p="xxl"
      withBorder
      data-testid="health-check-card"
      data-check-id={check.id}
    >
      <Stack gap="lg">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Group gap="sm">
            <SeverityBadge severity={check.severity} isAffecting={isFailing} />
            {isFailing && check.requires_restart && (
              <Badge color="neutral" size="sm">{t`Requires a restart`}</Badge>
            )}
          </Group>
          <Text size="sm" c="text-secondary">
            {t`Checked ${getRelativeTime(check.checked_at)}`}
          </Text>
        </Group>

        <Stack gap="sm">
          <Title order={4}>{check.title}</Title>
          <Text c="text-secondary">{check.description}</Text>
        </Stack>

        <HealthCheckItems check={check} />

        {isFailing && (
          <Box>
            <Text fw={700} mb="xxs">{t`How to fix`}</Text>
            <Text c="text-secondary">{check.remediation}</Text>
          </Box>
        )}

        <Group gap="lg" mt="sm">
          {settingsUrl && (
            <Button component={Link} to={settingsUrl} variant="filled">
              {t`Open settings`}
            </Button>
          )}
          <RecheckButton
            isRechecking={isRechecking}
            isDisabled={isRecheckingAll}
            onClick={handleRecheck}
          >
            {t`Re-check`}
          </RecheckButton>
          {showMetabaseLinks && (
            <Button component={ExternalLink} href={docsUrl} variant="subtle">
              {t`Read the docs`}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
};
