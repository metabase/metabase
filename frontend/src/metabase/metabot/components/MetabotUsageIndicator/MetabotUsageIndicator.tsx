import { CompactUsageIndicator } from "./CompactUsageIndicator";
import { DetailedUsageIndicator } from "./DetailedUsageIndicator";

interface MetabotUsageIndicatorProps {
  variant: "compact" | "detailed";
}

export function MetabotUsageIndicator({ variant }: MetabotUsageIndicatorProps) {
  return variant === "compact" ? (
    <CompactUsageIndicator />
  ) : (
    <DetailedUsageIndicator />
  );
}
