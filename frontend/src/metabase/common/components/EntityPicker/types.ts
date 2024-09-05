import type { IconName } from "metabase/ui";

import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel<Id, Model extends string> = {
  id: Id;
  model: Model;
  name: string;
  can_write?: boolean;
};

export type IsFolder<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = (item: Item) => boolean;

export type PickerState<Item, Query> = PickerStateItem<Item, Query>[];

export type PickerStateItem<Item, Query> = {
  query?: Query;
  selectedItem: Item | null;
};

export type EntityPickerOptions = EntityPickerModalOptions;

export type EntityTab<Model extends string> = {
  displayName: string;
  element: JSX.Element;
  icon: IconName;
  model: Model;
  additionalModels?: Model[];
};

export type ListProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
  Options extends EntityPickerOptions,
> = {
  query?: Query;
  onClick: (val: Item) => void;
  selectedItem: Item | null;
  isFolder: IsFolder<Id, Model, Item>;
  isCurrentLevel: boolean;
  options: Options;
  shouldDisableItem?: (item: Item) => boolean;
  shouldShowItem?: (item: Item) => boolean;
};

export type FilterItemsInPersonalCollection = "only" | "exclude";
