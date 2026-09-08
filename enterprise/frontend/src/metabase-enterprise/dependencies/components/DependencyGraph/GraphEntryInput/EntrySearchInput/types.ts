import type { DependencyEntry, SearchModel } from "metabase-types/api";
import type { SelectOption } from "metabase/ui";

export type EntrySelectOption = SelectOption & {
  entry?: DependencyEntry;
  model?: SearchModel;
};
