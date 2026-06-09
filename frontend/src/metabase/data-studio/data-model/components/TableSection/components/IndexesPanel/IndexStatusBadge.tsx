import { t } from "ttag";

import { Badge, type BadgeProps, Group, Loader } from "metabase/ui";
import type { IndexRequestStatus } from "metabase-types/api";

type BadgeColor = BadgeProps["color"];

interface Props {
  status: IndexRequestStatus | "exists";
}

function statusLabel(status: IndexRequestStatus | "exists"): string {
  switch (status) {
    case "pending":
      return t`Pending`;
    case "running":
      return t`Running`;
    case "succeeded":
      return t`Active`;
    case "failed":
      return t`Failed`;
    case "dropped":
      return t`Dropped`;
    case "exists":
      return t`Active`;
  }
}

function statusColor(status: IndexRequestStatus | "exists"): BadgeColor {
  switch (status) {
    case "pending":
    case "running":
      return "brand";
    case "failed":
      return "error";
    case "dropped":
      return "text-secondary";
    case "succeeded":
    case "exists":
    default:
      return "success";
  }
}

export function IndexStatusBadge({ status }: Props) {
  const showSpinner = status === "pending" || status === "running";

  return (
    <Group gap={6} wrap="nowrap">
      {showSpinner && <Loader size="xs" />}
      <Badge variant="light" color={statusColor(status)}>
        {statusLabel(status)}
      </Badge>
    </Group>
  );
}
