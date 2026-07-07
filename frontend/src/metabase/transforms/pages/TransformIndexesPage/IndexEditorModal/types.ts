import type { IndexKind } from "metabase-types/api";

export type ColumnOption = {
  value: string;
  label: string;
};

export type IndexKindOption = {
  value: IndexKind;
  label: string;
  description: string | null;
};
