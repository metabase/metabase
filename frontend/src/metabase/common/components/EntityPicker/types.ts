import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import type { SearchResult, SearchResultId } from "metabase-types/api";

import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel<Id, Model extends string> = {
  id: Id;
  model: Model;
  name: string;
  can_write?: boolean;
  moderated_status?: "verified" | null;
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
  entity?: "collection" | "dashboard";
};

export type EntityPickerOptions = EntityPickerModalOptions;

export type EntityPickerTabRenderProps<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = {
  onItemSelect: (item: Item) => void;
};

export type EntityPickerTabId = string;

export type EntityPickerTab<
  Id extends SearchResultId,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = {
  id: EntityPickerTabId;
  displayName: string;
  render: (props: EntityPickerTabRenderProps<Id, Model, Item>) => JSX.Element;
  icon: IconName;
  /**
   * Recents & Search tabs don't have models associated with them - hence null
   * (they provide the same models as the other tabs combined).
   */
  models: Model[];
  folderModels: Model[];
  extraButtons?: ReactNode[];
};

export type EntityPickerSearchScope = "everywhere" | "folder";

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
  entity?: "collection" | "dashboard";
};

export type FilterItemsInPersonalCollection = "only" | "exclude";

export type TabFolderState<
  Id,
  Model extends string,
  Item extends TypeWithModel<Id, Model>,
> = Partial<Record<EntityPickerTabId, Item>>;

export type SearchItem = Pick<SearchResult, "id" | "model" | "name"> &
  Partial<
    Pick<
      SearchResult,
      | "collection"
      | "dashboard"
      | "description"
      | "collection_authority_level"
      | "moderated_status"
      | "display"
      | "database_name"
      | "table_schema"
    >
  >;
