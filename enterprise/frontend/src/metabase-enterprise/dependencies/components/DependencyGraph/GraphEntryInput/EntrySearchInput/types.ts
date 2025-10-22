import type { SelectOption } from "metabase/ui";
import type { DependencyEntry, SearchModel } from "metabase-types/api";

export type EntrySelectOption = SelectOption & {
  entry?: DependencyEntry;
  model?: SearchModel;
};
