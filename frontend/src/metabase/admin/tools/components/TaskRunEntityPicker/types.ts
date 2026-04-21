import type { TaskRunEntityType } from "metabase-types/api";

export type EntityValue = {
  entityType: TaskRunEntityType;
  entityId: number;
};
