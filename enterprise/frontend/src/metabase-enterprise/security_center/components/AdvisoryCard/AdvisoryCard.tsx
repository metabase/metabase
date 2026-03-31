import { t } from "ttag";

import {
  Anchor,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import type { Advisory, AdvisorySeverity } from "../../types";
import { isAcknowledged, isAffected } from "../../utils";

import S from "./AdvisoryCard.module.css";

const SEVERITY_CLASS: Record<AdvisorySeverity, string> = {
  critical: S.severityCritical,
  high: S.severityHigh,
  medium: S.severityMedium,
  low: S.severityLow,
};

function formatVersionRange(advisory: Advisory): string {
  return advisory.affected_versions
    .map((v) => `${v.min} – ${v.fixed}`)
    .join(", ");
}

interface AdvisoryCardProps {
  advisory: Advisory;
  onAcknowledge?: (advisoryId: string) => void;
}

export function AdvisoryCard({ advisory, onAcknowledge }: AdvisoryCardProps) {
  const affected = isAffected(advisory);
  const acknowledged = isAcknowledged(advisory);

  return (
    <Card
      p="lg"
      withBorder
      className={affected ? S.affectedCard : undefined}
      data-testid="advisory-card"
      mih={184}
    >
      <Stack gap="sm">
        <Flex justify="space-between" align="center" wrap="wrap" gap="sm">
          <Group gap="sm">
            <Badge className={SEVERITY_CLASS[advisory.severity]}>
              {advisory.severity}
            </Badge>
            <Title order={4}>{advisory.title}</Title>
          </Group>
          <Group gap="sm">
            {acknowledged && (
              <Badge
                color="brand"
                variant="light"
                data-testid="acknowledged-badge"
              >
                {t`Acknowledged`}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={affected ? S.statusAffected : S.statusNotAffected}
              data-testid="affected-status"
            >
              {affected ? t`Affected` : t`Not affected`}
            </Badge>
          </Group>
        </Flex>

        <Text lineClamp={2} c="text-secondary">
          {advisory.description}
        </Text>

        <Group gap="lg">
          {advisory.affected_versions.length > 0 && (
            <Text size="sm" c="text-secondary">
              {t`Affected versions`}: {formatVersionRange(advisory)}
            </Text>
          )}
          <Text size="sm" c="text-secondary">
            {t`Remediation`}: {advisory.remediation}
          </Text>
        </Group>

        <Group gap="md" h={28}>
          {advisory.advisory_url && (
            <Anchor
              href={advisory.advisory_url}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
            >
              {t`View advisory`}
            </Anchor>
          )}
          {!acknowledged && onAcknowledge && (
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => onAcknowledge(advisory.advisory_id)}
              data-testid="acknowledge-button"
            >
              {t`Acknowledge`}
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
