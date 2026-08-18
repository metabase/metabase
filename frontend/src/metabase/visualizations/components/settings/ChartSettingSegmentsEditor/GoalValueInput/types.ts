import type { ReferencedEntityType } from "metabase-types/api";

export type GoalEntityRef = {
  type: ReferencedEntityType;
  id: number;
};

export type ColumnOption = {
  name: string;
  label: string;
};
