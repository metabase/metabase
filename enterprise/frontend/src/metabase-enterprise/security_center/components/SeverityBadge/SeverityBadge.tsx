import { match } from "ts-pattern";
import { t } from "ttag";

import { Badge, type BadgeColor } from "metabase/ui";
import type { AdvisorySeverity } from "metabase-types/api";

const SEVERITY_COLORS: Record<AdvisorySeverity, BadgeColor> = {
  critical: "negative",
  high: "negative",
  medium: "warning",
  low: "positive",
};

const getSeverityLabel = (severity: AdvisorySeverity) =>
  match(severity)
    .with("critical", () => t`Critical`)
    .with("high", () => t`High`)
    .with("medium", () => t`Medium`)
    .with("low", () => t`Low`)
    .exhaustive();

type SeverityBadgeProps = {
  severity: AdvisorySeverity;
  isAffecting: boolean;
};

export const SeverityBadge = ({
  severity,
  isAffecting,
}: SeverityBadgeProps) => {
  const isCritical = isAffecting && severity === "critical";

  return (
    <Badge
      color={isAffecting ? SEVERITY_COLORS[severity] : "neutral"}
      tt={isCritical ? "uppercase" : undefined}
      size="sm"
    >
      {getSeverityLabel(severity)}
    </Badge>
  );
};
