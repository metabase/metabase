import { t } from "ttag";

import type { UsageScope } from "metabase/metabot/hooks/use-metabot-usage";

export function formatUsageText(
  scope: UsageScope,
  unit: string | null,
): string {
  const limit = scope.limit;
  const usage = Math.min(scope.usage, limit);

  if (unit === "messages") {
    return t`${usage} / ${limit} messages used`;
  }

  const tokenUsage = usage.toFixed(1);
  const tokenLimit = limit.toFixed(1);

  return t`${tokenUsage} / ${tokenLimit}M tokens used`;
}
