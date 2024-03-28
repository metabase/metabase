import type { IconName } from "metabase/ui";

import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel<Id, Model extends string> = {
  id: Id;
  model: Model;
  name: string;
};

export type IsFolder<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = (item: Item) => boolean;

export type PickerState<Model, Item, Query> = PickerStateItem<
  Model,
  Item,
  Query
>[];

export type PickerStateItem<Model, Item, Query> = {
  model: Model;
  query?: Query;
  selectedItem: Item | null;
};

export type EntityPickerOptions = EntityPickerModalOptions;

export type EntityTab<Model extends string> = {
  displayName: string;
  element: JSX.Element;
  icon: IconName;
  model: Model;
};

export type ListProps<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
  Query,
  Options extends EntityPickerOptions,
> = {
  model: Model;
  query?: Query;
  onClick: (item: Item) => void;
  selectedItem: Item | null;
  isFolder: IsFolder<Id, Model, Item>;
  isCurrentLevel: boolean;
  options: Options;
  shouldDisableItem?: (item: Item) => boolean;
};
