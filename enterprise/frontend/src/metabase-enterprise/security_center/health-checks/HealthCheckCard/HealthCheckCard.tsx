import { useState } from "react";
import { t } from "ttag";

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
import type { HealthCheck } from "metabase-types/api";

import { SeverityBadge } from "../../components/SeverityBadge/SeverityBadge";
import { HealthCheckItems } from "../HealthCheckItems/HealthCheckItems";
import { getHealthCheckSettingsUrl } from "../utils";

type HealthCheckCardProps = {
  check: HealthCheck;
};

export const HealthCheckCard = ({ check }: HealthCheckCardProps) => {
  const [isShowingDetails, setIsShowingDetails] = useState(false);
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(check.docs.page, {
    anchor: check.docs.anchor,
  });
  const isFailing = check.status === "fail";
  const settingsUrl = isFailing ? getHealthCheckSettingsUrl(check.id) : null;

  return (
    <Card p="xxl" withBorder data-testid={`health-check-card-${check.id}`}>
      <Stack gap="lg">
        <Group
          gap="lg"
          justify="space-between"
          align="flex-start"
          wrap="nowrap"
        >
          <Stack gap="xs">
            <Group gap="sm">
              <Title order={4}>{check.title}</Title>
              <SeverityBadge
                severity={check.severity}
                isAffecting={isFailing}
                size="xs"
              />
            </Group>
            <Text c="text-secondary">{check.description}</Text>
          </Stack>
          {check.items.length > 0 && (
            <Button
              variant="subtle"
              onClick={() => setIsShowingDetails((isShowing) => !isShowing)}
            >
              {isShowingDetails ? t`Hide details` : t`Show details`}
            </Button>
          )}
        </Group>

        {isShowingDetails && <HealthCheckItems check={check} />}

        {isFailing && (
          <Box>
            <Group gap="sm">
              <Text fw={700}>{t`How to fix`}</Text>
              {check.requires_restart && (
                <Badge color="neutral" variant="light" size="xs">
                  {t`Requires a restart`}
                </Badge>
              )}
            </Group>
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
            <Button component={ExternalLink} href={docsUrl} variant="default">
              {t`Read the docs`}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
};
