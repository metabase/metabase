import { Badge } from "metabase/ui";
import type { Task } from "metabase-types/api";

import { formatTaskStatus, getTaskStatusColor } from "../../utils";

type TaskStatusProps = {
  task: Task;
};

export const TaskStatusBadge = ({ task }: TaskStatusProps) => (
  <Badge color={getTaskStatusColor(task.status)}>
    {formatTaskStatus(task.status)}
  </Badge>
);
