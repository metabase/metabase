import type { ReactNode } from "react";

import type { IconName } from "metabase/ui";
import type {
  CollectionId,
  CollectionItem,
  CollectionType,

    DatabaseId,
    SchemaName,
    SearchResult,
    SearchResultId,
    TableId} from "metabase-types/api";

import type {
  TablePickerStatePath,
  TablePickerValue,
} from "../Pickers/TablePicker";

import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel<Id, Model extends string> = {
  id: Id;
  model: Model;
  name: string;
  can_write?: boolean;
  moderated_status?: "verified" | null;
  type?: CollectionType;
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
  refresh?: () => void;
  initialValue?: TablePickerValue;
  tablesPath?: TablePickerStatePath;
  onTablesPathChange?: (tablesPath: TablePickerStatePath) => void;
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


// =========== new try on types ===========

export type OmniPickerCollectionItem = Pick<
  CollectionItem,
  "name" | "model" | "here" | "below" | "moderated_status" | "display" | "can_write" | "location"
> & {
  id: CollectionItem["id"] | CollectionId;
};

export type OmniPickerDashboardItem = {
  model: "dashboard";
  id: CollectionItem["id"] | CollectionId;
  name: string;
  here?: CollectionItem["here"];
  below?: CollectionItem["below"];
};

export type OmniPickerPickableItem<PickableModels extends CollectionItem["model"]> = OmniPickerItem & {
  model: PickableModels;
};

export type OmniPickerSchemaItem = {
  model: "schema";
  id: SchemaName;
  db_id: DatabaseId;
  name: SchemaName;
};

export type OmniPickerTableItem = {
  model: "table";
  id: TableId;
  db_id: DatabaseId;
  name: string;
};

export type OmniPickerDatabaseItem = {
  model: "database";
  id: DatabaseId;
  name: string;
};

export enum OmniPickerFolderModel {
  Database = "database",
  Schema = "schema",
  Collection = "collection",
  Dashboard = "dashboard",
}

export type DbTreeItem = OmniPickerDatabaseItem | OmniPickerSchemaItem | OmniPickerTableItem;

export const isInDbTree = (
  item: OmniPickerItem,
): item is DbTreeItem => {
  return (
    item.model === "database" ||
    item.model === "schema" ||
    item.model === "table"
  );
};

// this includes all possible item types that can be shown in the mini picker
export type OmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerSchemaItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;

// this is only the intermediate/folder types that cannot ultimately be picked
export type OmniPickerFolderItem =
  | OmniPickerDatabaseItem
  | OmniPickerSchemaItem
  | OmniPickerDashboardItem
  | OmniPickerCollectionItem & { model: "collection" };

// can't get schemas in search results
export type SearchableOmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;

