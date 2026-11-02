import { Badge } from "metabase/ui";
import type { AdvisorySeverity } from "metabase-types/api";

import { getSeverityColor, getSeverityLabel } from "../../utils";

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
      color={getSeverityColor({ isAffecting, severity })}
      tt={isCritical ? "uppercase" : undefined}
      size="sm"
    >
      {getSeverityLabel(severity)}
    </Badge>
  );
};
