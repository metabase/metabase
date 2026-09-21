import type { IndexKind } from "metabase-types/api";

export type IndexKindOption = {
  value: IndexKind;
  label: string;
  description: string | null;
};
