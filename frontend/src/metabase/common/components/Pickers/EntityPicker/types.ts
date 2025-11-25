import type { Dispatch, SetStateAction } from "react";

import type {
  CardId,
  Collection,
  CollectionId,
  CollectionItem,
  CollectionNamespace,
  DashboardId,
  DatabaseId,
  NativeQuerySnippet,
  RecentContexts,
  RegularCollectionId,
  SchemaName,
  SearchRequest,
  TableId,
} from "metabase-types/api";

export type EntityPickerOptions = {
  // options to show/hide root items
  hasSearch?: boolean;
  hasRecents?: boolean;
  hasDatabases?: boolean;
  hasLibrary?: boolean;
  hasRootCollection?: boolean;
  hasPersonalCollections?: boolean; // other users personal collections

  // options to customize the button bar
  hasConfirmButtons?: boolean;
  canCreateCollections?: boolean;
  canCreateDashboards?: boolean;
  confirmButtonText?:
    | React.ReactNode
    | ((i?: OmniPickerItem) => React.ReactNode);
  cancelButtonText?: React.ReactNode;
};

export type PickerItemFunctions = {
  isFolderItem: (item: OmniPickerItem) => item is OmniPickerFolderItem;
  isHiddenItem: (item: OmniPickerItem) => boolean;
  isDisabledItem: (item: OmniPickerItem) => boolean;
  isSelectableItem: (item: OmniPickerItem) => boolean;
};

export type EntityPickerProps = {
  onChange: (value: OmniPickerItem) => void;
  onClose: () => void;
  models: OmniPickerItem["model"][];
  namespaces?: CollectionNamespace[];
  options: EntityPickerOptions;
  searchParams?: Partial<SearchRequest>;
  value?: OmniPickerValue;
  searchQuery?: string;
  recentsContext?: RecentContexts[];
  isNewCollectionDialogOpen: boolean;
  openNewCollectionDialog: () => void;
  closeNewCollectionDialog: () => void;
  isNewDashboardDialogOpen: boolean;
  openNewDashboardDialog: () => void;
  closeNewDashboardDialog: () => void;
} & Partial<PickerItemFunctions>; // picker functions are optional in props

export type OmniPickerContextValue = {
  path: OmniPickerItem[];
  setPath: Dispatch<SetStateAction<OmniPickerItem[]>>;
  isLoadingPath: boolean;
  previousPath: OmniPickerItem[];
  setPreviousPath: Dispatch<SetStateAction<OmniPickerItem[]>>;
  searchScope: SearchScope;
  setSearchScope: Dispatch<SetStateAction<SearchScope>>;
  searchParams?: Partial<SearchRequest>;
  namespaces: CollectionNamespace[]; // not optional in context
} & EntityPickerProps &
  PickerItemFunctions; // picker functions are required in context

export type OmniPickerCollectionItem = Pick<
  CollectionItem,
  | "name"
  | "model"
  | "here"
  | "below"
  | "moderated_status"
  | "display"
  | "can_write"
  | "location"
  | "type"
  | "database_id"
  | "location"
  | "effective_location"
> & {
  id: CollectionItem["id"] | CollectionId;
  collection?:
    | (Pick<Collection, "id" | "name" | "authority_level"> & {
        namespace?: CollectionNamespace;
      })
    | null;
  dashboard_id?: DashboardId;
  namespace?: CollectionNamespace;
  is_personal?: boolean;
};

export type OmniPickerDashboardItem = {
  model: "dashboard";
  id: CollectionItem["id"] | CollectionId;
  name: string;
  here?: CollectionItem["here"];
  below?: CollectionItem["below"];
};

export type OmniPickerPickableItem<
  PickableModels extends CollectionItem["model"],
> = OmniPickerItem & {
  model: PickableModels;
};

export type OmniPickerSchemaItem = {
  model: "schema";
  id: SchemaName;
  database_id: DatabaseId;
  name: SchemaName;
};

export type OmniPickerTableItem = {
  model: "table";
  id: TableId;
  database_id: DatabaseId; // the api returns db_id for tables 🙄
  database_name?: string;
  schema?: SchemaName;
  name: string;
};

export type OmniPickerQuestionItem = Omit<
  OmniPickerCollectionItem,
  "id" | "model"
> & {
  model: "card" | "dataset" | "metric";
  id: CardId;
};

export type OmniPickerDatabaseItem = {
  model: "database";
  id: DatabaseId;
  name: string;
};

export type OmniPickerSnippetItem = Pick<NativeQuerySnippet, "id" | "name"> & {
  model: "snippet";
};

export enum OmniPickerFolderModel {
  Database = "database",
  Schema = "schema",
  Collection = "collection",
  Dashboard = "dashboard",
}

export type DbTreeItem =
  | OmniPickerDatabaseItem
  | OmniPickerSchemaItem
  | OmniPickerTableItem;

export const isInDbTree = (item: OmniPickerItem): item is DbTreeItem => {
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

export type OmniPickerDbValue = Pick<DbTreeItem, "model" | "id">;
export type OmniPickerTableValue = Pick<OmniPickerTableItem, "model" | "id">;
export type OmniPickerCollectionItemValue = Pick<
  OmniPickerCollectionItem,
  "model" | "id" | "namespace"
>;

export type OmniPickerValue = OmniPickerDbValue | OmniPickerCollectionItemValue;

// this is only the intermediate/folder types that cannot ultimately be picked
export type OmniPickerFolderItem =
  | OmniPickerDatabaseItem
  | OmniPickerSchemaItem
  | OmniPickerDashboardItem
  | (OmniPickerCollectionItem & { model: "collection" });

// can't get schemas in search results
export type SearchableOmniPickerItem =
  | OmniPickerCollectionItem
  | OmniPickerTableItem
  | OmniPickerDatabaseItem;

// used to find only or exclude items in personal collections, usually when adding items to a dashboard
// so that you don't end up with personal items in a public dashboard
export type FilterItemsInPersonalCollection = "only" | "exclude";

export type SearchScope =
  | Exclude<RegularCollectionId, string>
  | "databases"
  | "all"
  | null;
