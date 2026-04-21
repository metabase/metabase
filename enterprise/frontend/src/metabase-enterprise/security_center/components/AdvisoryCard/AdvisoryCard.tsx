import { t } from "ttag";

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Icon,
  List,
  Stack,
  Text,
  Title,
  Tooltip,
} from "metabase/ui";
import type {
  Advisory,
  AdvisoryId,
  AdvisorySeverity,
} from "metabase-types/api";

import { isAcknowledged } from "../../utils";

import S from "./AdvisoryCard.module.css";

const SEVERITY_CLASS: Record<AdvisorySeverity, string> = {
  critical: S.severityCritical,
  high: S.severityHigh,
  medium: S.severityMedium,
  low: S.severityLow,
};

interface AdvisoryCardProps {
  advisory: Advisory;
  isAffecting: boolean;
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
}

export function AdvisoryCard({
  advisory,
  isAffecting,
  onAcknowledge,
}: AdvisoryCardProps) {
  const acknowledged = isAcknowledged(advisory);

  return (
    <Card p="xl" withBorder data-testid="advisory-card">
      <Stack gap="md">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Badge
            className={
              isAffecting
                ? SEVERITY_CLASS[advisory.severity]
                : S.severityNeutral
            }
          >
            {advisory.severity}
          </Badge>
          {!isAffecting && (
            <Group gap="xs" align="center">
              <Text size="sm" c="success" fw={500}>
                {t`Your instance is not affected`}
              </Text>
              <Icon name="check_filled" c="success" size={20} />
            </Group>
          )}
        </Group>

        <Title order={4}>{advisory.title}</Title>

        <Text c="text-secondary">{advisory.description}</Text>

        {advisory.affected_versions.length > 0 && (
          <Box>
            <Text fw={700} mb="xs">{t`Affected versions`}</Text>
            <List size="sm">
              {advisory.affected_versions.map((v) => (
                <List.Item
                  key={`${v.min}-${v.fixed}`}
                >{`${v.min} - ${v.fixed}`}</List.Item>
              ))}
            </List>
          </Box>
        )}

        <Box>
          <Text fw={700} mb="xs">{t`Remediation`}</Text>
          <Text c="text-secondary">{advisory.remediation}</Text>
        </Box>

        <Group gap="md" mt="sm">
          {!acknowledged && onAcknowledge && (
            <Tooltip
              label={t`Clicking on Dismiss just hides the notification and you can view this later by toggling 'Show dismissed'`}
            >
              <Button
                variant="outline"
                color="text-secondary"
                onClick={() => onAcknowledge(advisory.advisory_id)}
                data-testid="acknowledge-button"
              >
                {t`Dismiss`}
              </Button>
            </Tooltip>
          )}
          {acknowledged && (
            <Button
              variant="outline"
              color="text-secondary"
              disabled
              data-testid="acknowledge-button"
            >
              {t`Dismissed`}
            </Button>
          )}
          {advisory.advisory_url && (
            <Anchor
              href={advisory.advisory_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              style={{ alignSelf: "center" }}
            >
              {t`View advisory`}
            </Anchor>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
