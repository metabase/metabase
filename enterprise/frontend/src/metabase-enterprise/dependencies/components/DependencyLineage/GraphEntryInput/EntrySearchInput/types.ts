import type { SelectOption } from "metabase/ui";
import type { DependencyEntry, SearchModel } from "metabase-types/api";

export type ItemSelectOption = SelectOption & {
  type: "item";
  entry: DependencyEntry;
  model: SearchModel;
};

export type DividerSelectOption = SelectOption & {
  type: "divider";
};

export type BrowseSelectOption = SelectOption & {
  type: "browse";
};

export type EntrySelectOption =
  | ItemSelectOption
  | DividerSelectOption
  | BrowseSelectOption;
