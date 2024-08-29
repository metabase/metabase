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

export type EntityTabRenderProps = {
  onItemSelect: (item: TypeWithModel<string | number, string>) => void;
};

export type EntityTab<Model extends string> = {
  displayName: string;
  render: (props: EntityTabRenderProps) => JSX.Element;
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

export type TabFolderState<Model extends string> = Partial<
  Record<Model, TypeWithModel<unknown, string>>
>;
