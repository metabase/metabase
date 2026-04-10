import { t } from "ttag";

import { useIsSmallScreen } from "metabase/common/hooks/use-is-small-screen";
import { Anchor, Badge, Card, Group, Stack, Text, Title } from "metabase/ui";
import type {
  Advisory,
  AdvisoryId,
  AdvisorySeverity,
} from "metabase-types/api";

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
  onAcknowledge?: (advisoryId: AdvisoryId) => void;
}

export function AdvisoryCard({ advisory, onAcknowledge }: AdvisoryCardProps) {
  const affected = isAffected(advisory);
  const acknowledged = isAcknowledged(advisory);
  const isSmallScreen = useIsSmallScreen();

  const badges = (
    <>
      <Badge className={SEVERITY_CLASS[advisory.severity]}>
        {advisory.severity}
      </Badge>
      <Badge
        variant="outline"
        className={affected ? S.statusAffected : S.statusNotAffected}
        data-testid="affected-status"
      >
        {affected ? t`Affected` : t`Not affected`}
      </Badge>
      {acknowledged && (
        <Badge color="brand" variant="light" data-testid="acknowledged-badge">
          {t`Dismissed`}
        </Badge>
      )}
    </>
  );

  const acknowledgeButton = !acknowledged && onAcknowledge && (
    <Anchor
      component="button"
      size="sm"
      onClick={() => onAcknowledge(advisory.advisory_id)}
      data-testid="acknowledge-button"
    >
      {t`Dismiss`}
    </Anchor>
  );

  return (
    <Card
      p="lg"
      withBorder
      className={affected ? S.affectedCard : undefined}
      data-testid="advisory-card"
      mih={184}
    >
      <Stack gap="sm">
        {isSmallScreen && (
          <Group gap="sm" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="wrap">
              {badges}
            </Group>
            {acknowledgeButton}
          </Group>
        )}
        <Group gap="sm" align="center" wrap="wrap">
          {!isSmallScreen && badges}
          <Title order={4}>{advisory.title}</Title>
        </Group>

        <Text lineClamp={2} c="text-secondary">
          {advisory.description}
        </Text>

        <Stack gap="xs">
          {advisory.affected_versions.length > 0 && (
            <Text size="sm" c="text-secondary">
              {t`Affected versions: ${formatVersionRange(advisory)}`}
            </Text>
          )}
          <Text size="sm" c="text-secondary">
            {t`Remediation: ${advisory.remediation}`}
          </Text>
        </Stack>

        {(advisory.advisory_url || !isSmallScreen) && (
          <Group gap="md" h={28}>
            {!isSmallScreen && acknowledgeButton}
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
          </Group>
        )}
      </Stack>
    </Card>
  );
}
