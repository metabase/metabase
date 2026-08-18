import type { ReferencedEntityType } from "metabase-types/api";

export type GoalEntityRef = {
  type: ReferencedEntityType;
  id: number;
};

export type ColumnOption = {
  name: string;
  label: string;
};

export type PickedItem = {
  id: number | string;
  model: string;
  name: string;
};
