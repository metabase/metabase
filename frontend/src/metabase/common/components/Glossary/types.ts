import type { GlossaryItem } from "metabase/api";
import type { SortDirection } from "metabase-types/api";

export type GlossaryField = keyof Pick<GlossaryItem, "term" | "definition">;

export type GlossarySort = {
  field: GlossaryField;
  direction: SortDirection;
};
