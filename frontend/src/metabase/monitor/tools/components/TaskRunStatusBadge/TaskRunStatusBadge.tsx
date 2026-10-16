import { Badge, Tooltip } from "metabase/ui";
import type { TaskRun } from "metabase-types/api";

import {
  formatSkipReason,
  formatTaskRunStatus,
  getTaskRunStatusColor,
} from "../../utils";

type TaskRunStatusBadgeProps = {
  taskRun: TaskRun;
};

const getSkipReason = ({
  status,
  skip_reason,
}: Pick<TaskRun, "status" | "skip_reason">): string | null =>
  status === "skipped" && skip_reason ? formatSkipReason(skip_reason) : null;

export const TaskRunStatusBadge = ({ taskRun }: TaskRunStatusBadgeProps) => {
  const skipReason = getSkipReason(taskRun);

  return (
    <Tooltip label={skipReason} disabled={!skipReason}>
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
