import { match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import type {
  Task,
  TaskRun,
  TaskRunDateFilterOption,
  TaskRunEntityType,
  TaskRunStatus,
  TaskRunType,
  TaskStatus,
} from "metabase-types/api";

export const formatTaskRunType = (runType: TaskRunType) =>
  match(runType)
    .with("subscription", () => t`Subscription`)
    .with("alert", () => t`Alert`)
    .with("sync", () => t`Sync`)
    .with("fingerprint", () => t`Fingerprint`)
    .exhaustive();

export const formatTaskRunEntityType = (entityType: TaskRunEntityType) =>
  match(entityType)
    .with("database", () => t`Database`)
    .with("card", () => t`Card`)
    .with("dashboard", () => t`Dashboard`)
    .exhaustive();

export const formatTaskRunStatus = (status: TaskRunStatus) =>
  match(status)
    .with("started", () => t`Started`)
    .with("success", () => t`Success`)
    .with("failed", () => t`Failed`)
    .with("abandoned", () => t`Abandoned`)
    .exhaustive();

export const formatTaskStatus = (status: TaskStatus) =>
  match(status)
    .with("failed", () => t`Failed`)
    .with("started", () => t`Started`)
    .with("success", () => t`Success`)
    .with("unknown", () => t`Unknown`)
    .exhaustive();

export const getEntityUrl = (
  entityType: TaskRunEntityType,
  entityId: number,
  entityName?: string,
): string =>
  match(entityType)
    .with("database", () => Urls.viewDatabase(entityId))
    .with("card", () => Urls.question({ id: entityId, name: entityName }))
    .with("dashboard", () => Urls.dashboard({ id: entityId }))
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

export const formatTaskDetails = (task: Task | undefined): string => {
  try {
    return JSON.stringify(task?.task_details, null, 2) ?? "";
  } catch {
    return "";
  }
};

export const renderTaskRunCounters = ({
  task_count,
  success_count,
  failed_count,
}: TaskRun) => {
  const success = t`Success`;
  const failed = t`Failed`;
  return `${task_count} (${success}: ${success_count} / ${failed}: ${failed_count})`;
};

export const guardTaskRunRunType = (value: string): value is TaskRunType =>
  (
    ["subscription", "alert", "sync", "fingerprint"] satisfies TaskRunType[]
  ).includes(value as TaskRunType);

export const guardTaskRunEntityType = (
  value: string,
): value is TaskRunEntityType =>
  (["database", "card", "dashboard"] satisfies TaskRunEntityType[]).includes(
    value as TaskRunEntityType,
  );

export const guardTaskRunStatus = (value: string): value is TaskRunStatus =>
  (
    ["started", "success", "failed", "abandoned"] satisfies TaskRunStatus[]
  ).includes(value as TaskRunStatus);

export const guardTaskRunStartedAtRange = (
  value: string,
): value is TaskRunDateFilterOption =>
  (
    [
      "thisday",
      "past1days~",
      "past1weeks~",
      "past7days~",
      "past30days~",
      "past1months~",
      "past3months~",
      "past12months~",
    ] satisfies TaskRunDateFilterOption[]
  ).includes(value as TaskRunDateFilterOption);
