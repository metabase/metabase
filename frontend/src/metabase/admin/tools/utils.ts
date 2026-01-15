import { match } from "ts-pattern";
import { t } from "ttag";

import type {
  Task,
  TaskRunExtended,
  TaskRunStatus,
  TaskStatus,
} from "metabase-types/api";

export const formatTaskRunType = (runType: TaskRunExtended["run_type"]) =>
  match(runType)
    .with("subscription", () => t`Subscription`)
    .with("alert", () => t`Alert`)
    .with("sync", () => t`Sync`)
    .with("fingerprint", () => t`Fingerprint`)
    .exhaustive();

export const formatTaskRunEntityType = (
  entityType: TaskRunExtended["entity_type"],
) =>
  match(entityType)
    .with("database", () => t`Database`)
    .with("card", () => t`Card`)
    .with("dashboard", () => t`Dashboard`)
    .exhaustive();

export const formatTaskRunStatus = (status: TaskRunExtended["status"]) =>
  match(status)
    .with("started", () => t`Started`)
    .with("success", () => t`Success`)
    .with("failed", () => t`Failed`)
    .with("abandoned", () => t`Abandoned`)
    .exhaustive();

export const formatTaskStatus = (status: Task["status"]) =>
  match(status)
    .with("failed", () => t`Failed`)
    .with("started", () => t`Started`)
    .with("success", () => t`Success`)
    .with("unknown", () => t`Unknown`)
    .exhaustive();

export const getEntityUrl = (
  entityType: TaskRunExtended["entity_type"],
  entityId: number,
): string =>
  match(entityType)
    .with("database", () => `/admin/databases/${entityId}`)
    .with("card", () => `/question/${entityId}`)
    .with("dashboard", () => `/dashboard/${entityId}`)
    .exhaustive();

export const getTaskRunStatusColor = (status: TaskRunStatus) =>
  match(status)
    .with("success", () => "success" as const)
    .with("failed", () => "error" as const)
    .with("abandoned", () => "warning" as const)
    .otherwise(() => "text-primary" as const);

export const getTaskStatusColor = (status: TaskStatus) =>
  match(status)
    .with("success", () => "success" as const)
    .with("failed", () => "error" as const)
    .otherwise(() => "text-primary" as const);

export const getFilename = (task: Task | undefined) =>
  task ? `task-${task.id}.json` : "task.json";

export const formatTaskDetails = (task: Task | undefined): string =>
  task ? JSON.stringify(task.task_details, null, 2) : "";
