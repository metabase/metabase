import { t } from "ttag";

import type { UsageScope } from "metabase/metabot/hooks/use-metabot-usage";

export function getColor(scope: UsageScope): "error" | "warning" | "brand" {
  if (scope.isAtLimit) {
    return "error";
  }
  if (scope.isNearLimit) {
    return "warning";
  }
  return "brand";
}

export function formatResetRate(rate: string): string {
  switch (rate) {
    case "daily":
      return t`Resets daily`;
    case "weekly":
      return t`Resets weekly`;
    case "monthly":
      return t`Resets monthly`;
    default:
      return "";
  }
}

export function formatUsageText(
  scope: UsageScope,
  unit: string | null,
): string {
  if (unit === "messages") {
    return t`${scope.usage} / ${scope.limit} messages used`;
  }
  const usage = scope.usage.toFixed(1);
  const limit = scope.limit.toFixed(1);
  return t`${usage} / ${limit}M tokens used`;
}
