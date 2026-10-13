import { Badge, Text, Tooltip } from "metabase/ui";
import type { TaskRun } from "metabase-types/api";

import {
  formatSkipReason,
  formatTaskRunStatus,
  getTaskRunStatusColor,
} from "../../utils";

type TaskRunStatusBadgeProps = {
  taskRun: TaskRun;
};

const getStatusReason = ({
  status,
  skip_reason,
  failure_message,
}: TaskRun): string | null => {
  if (status === "skipped" && skip_reason) {
    return formatSkipReason(skip_reason);
  }
  if (status === "failed" && failure_message) {
    // the full message, which can be a long exception, is on the run's details page
    return failure_message.trim().split("\n")[0];
  }
  return null;
};

export const TaskRunStatusBadge = ({ taskRun }: TaskRunStatusBadgeProps) => {
  const reason = getStatusReason(taskRun);

  return (
    <Tooltip
      label={
        <Text c="inherit" fz="inherit" lh="inherit" lineClamp={3}>
          {reason}
        </Text>
      }
      disabled={!reason}
    >
      <Badge
        color={getTaskRunStatusColor(taskRun.status)}
        size="sm"
        variant="light"
      >
        {formatTaskRunStatus(taskRun.status)}
      </Badge>
    </Tooltip>
  );
};
