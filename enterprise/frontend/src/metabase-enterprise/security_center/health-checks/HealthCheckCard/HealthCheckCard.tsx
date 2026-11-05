import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import { useDocsUrl } from "metabase/common/hooks";
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";
import { getRelativeTime } from "metabase/utils/time-dayjs";
import type { HealthCheck } from "metabase-types/api";

import { SeverityBadge } from "../../components/SeverityBadge/SeverityBadge";
import { HealthCheckItems } from "../HealthCheckItems/HealthCheckItems";
import { getHealthCheckSettingsUrl } from "../utils";

type HealthCheckCardProps = {
  check: HealthCheck;
};

export const HealthCheckCard = ({ check }: HealthCheckCardProps) => {
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(check.docs.page, {
    anchor: check.docs.anchor,
  });
  const isFailing = check.status === "fail";
  const settingsUrl = isFailing ? getHealthCheckSettingsUrl(check.id) : null;

  return (
    <Card p="xxl" withBorder data-testid={`health-check-card-${check.id}`}>
      <Stack gap="lg">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Group gap="sm">
            <SeverityBadge severity={check.severity} isAffecting={isFailing} />
            {isFailing && check.requires_restart && (
              <Badge color="neutral" size="sm">{t`Requires a restart`}</Badge>
            )}
          </Group>
          <Text size="sm" c="text-secondary">
            {c("{0} is a relative time like 5 minutes ago")
              .t`Checked ${getRelativeTime(check.checked_at)}`}
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
