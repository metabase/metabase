import type { IconName } from "metabase/ui";
import type {
  SearchResult,
  SearchListQuery,
  SearchModelType,
  CollectionId,
} from "metabase-types/api";

import type { CollectionPickerOptions } from "./components/CollectionPicker";
import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel<Id, Model extends string> = {
  id: Id;
  model: Model;
  name: string;
};

export type TisFolder<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = (item: Item) => boolean;

export type PickerState<Item, Query> = PickerStateItem<Item, Query>[];

export type PickerStateItem<Item, Query> = EntityPickerStateItem<Item, Query>;

type EntityPickerStateItem<Item, Query> = {
  query?: Query;
  selectedItem: Item | null;
};

export type EntityPickerOptions = EntityPickerModalOptions &
  CollectionPickerOptions;

export type EntityTab<Model extends string> = {
  displayName: string;
  element: JSX.Element;
  icon: IconName;
  model: Model;
};
