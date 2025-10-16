import type { SelectOption } from "metabase/ui";
import type { DependencyEntry } from "metabase-types/api";

export type EntrySelectOption = SelectOption & {
  entry: DependencyEntry;
};
