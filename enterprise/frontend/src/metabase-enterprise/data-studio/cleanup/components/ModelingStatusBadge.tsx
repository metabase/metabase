import { Badge } from "metabase/ui";
import type { UsageMetadataModelingStatus } from "metabase-types/api";

import { getModelingStatusLabel } from "../utils";

type ModelingStatusBadgeProps = {
  status: UsageMetadataModelingStatus;
};

export function ModelingStatusBadge({ status }: ModelingStatusBadgeProps) {
  const color =
    status === "missing"
      ? "neutral"
      : status === "partially-modeled"
        ? "warning"
        : "positive";
  return <Badge color={color}>{getModelingStatusLabel(status)}</Badge>;
}
