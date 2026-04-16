import { Badge } from "metabase/ui";
import type { TaskRun } from "metabase-types/api";

import { formatTaskRunStatus, getTaskRunStatusColor } from "../../utils";

type TaskRunStatusBadgeProps = {
  taskRun: TaskRun;
};

export const TaskRunStatusBadge = ({ taskRun }: TaskRunStatusBadgeProps) => (
  <Badge color={getTaskRunStatusColor(taskRun.status)}>
    {formatTaskRunStatus(taskRun.status)}
  </Badge>
);
