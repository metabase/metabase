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

import S from "./AdvisoryCard.module.css";

const SEVERITY_CLASS: Record<AdvisorySeverity, string> = {
  critical: S.severityCritical,
  high: S.severityHigh,
  medium: S.severityMedium,
  low: S.severityLow,
};

interface AdvisoryCardProps {
  advisory: Advisory;
  onAcknowledge?: (advisoryId: string) => void;
}

export function AdvisoryCard({ advisory, onAcknowledge }: AdvisoryCardProps) {
  return (
    <Card
      p="lg"
      withBorder
      className={advisory.affected ? S.affectedCard : undefined}
      data-testid="advisory-card"
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
            {advisory.acknowledged && (
              <Badge
                color="brand"
                variant="light"
                data-testid="acknowledged-badge"
              >
                {t`Acknowledged`}
              </Badge>
            )}
            <Badge
              color={advisory.affected ? "error" : "success"}
              variant={advisory.affected ? "filled" : "light"}
              data-testid="affected-status"
            >
              {advisory.affected ? t`Affected` : t`Not affected`}
            </Badge>
          </Group>
        </Flex>

        <Text lineClamp={2} c="text-secondary">
          {advisory.description}
        </Text>

        <Group gap="lg">
          <Text size="sm" c="text-secondary">
            {t`Affected versions`}: {advisory.affectedVersionRange}
          </Text>
          <Text size="sm" c="text-secondary">
            {t`Fixed in`}: {advisory.fixedVersion}
          </Text>
        </Group>

        <Group gap="md">
          <Anchor
            href={advisory.advisoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {t`View advisory`}
          </Anchor>
          <Anchor
            href={advisory.upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
          >
            {t`Upgrade guide`}
          </Anchor>
          {!advisory.acknowledged && onAcknowledge && (
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => onAcknowledge(advisory.id)}
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
