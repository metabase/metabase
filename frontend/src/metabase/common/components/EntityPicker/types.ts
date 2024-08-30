import type { IconName } from "metabase/ui";
import type { SearchResultId } from "metabase-types/api";

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

export type EntityTabRenderProps<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = {
  onItemSelect: (item: Item) => void;
};

/**
 * It's not really an "entity" tab, as it is also used for recents and search tabs
 * TODO: rename
 */
export type EntityTab<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = {
  displayName: string;
  render: (props: EntityTabRenderProps<Id, Model, Item>) => JSX.Element;
  icon: IconName;
  model: TabId<Model>;
};

export type TabId<Model extends string> = Model | "recents" | "search";

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
