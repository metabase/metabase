/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

export type LabelId = number;

export type Label = {
  id: LabelId;
  name: string;
  slug: string;
  icon: string;
};
