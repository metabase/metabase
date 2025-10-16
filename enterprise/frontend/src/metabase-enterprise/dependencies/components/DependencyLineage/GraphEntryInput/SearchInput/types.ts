import type { SelectOption } from "metabase/ui";
import type { DependencyEntry } from "metabase-types/api";

export type SearchSelectOption = SelectOption & {
  entry: DependencyEntry;
};
