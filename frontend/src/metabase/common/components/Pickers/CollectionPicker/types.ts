import type {
  CardId,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  CollectionType,
  DashboardId,
  ListCollectionItemsRequest,
  SearchResult,
} from "metabase-types/api";

import type {
  EntityPickerModalOptions,
  ListProps,
  PickerState,
  TypeWithModel,
} from "../../EntityPicker";

export type CollectionItemId = CollectionId | CardId | DashboardId;

// internally, this picker supports all items that live in collections
// so that we can use its components for picking all of them
export type CollectionPickerModel = Extract<
  CollectionItemModel,
  "collection" | "card" | "dataset" | "metric" | "dashboard" | "table"
>;

// we can enforce type safety at the boundary of a collection-only picker with this type
export type CollectionPickerValueModel = Extract<
  CollectionPickerModel,
  "collection" | "dashboard"
>;

export type CollectionPickerItem = TypeWithModel<
  CollectionItemId,
  CollectionPickerModel
> &
  Pick<
    Partial<SearchResult>,
    "description" | "can_write" | "database_id" | "collection_type"
  > & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId | null;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
    type?: CollectionType;
  } & Pick<CollectionItem, "is_tenant_collection" | "is_tenant_dashboard">;

/**
 * Returns the collection type for an item.
 * Recent items and search results use `collection_type` field,
 * while regular collection picker items use `type` field.
 */
export function getCollectionType(
  item: CollectionPickerItem,
): CollectionType | null {
  return item.collection_type ?? item.type ?? null;
}

export type CollectionPickerValueItem =
  | (Omit<CollectionPickerItem, "model" | "id"> & {
      id: CollectionId;
      model: "collection";
    })
  | (Omit<CollectionPickerItem, "model" | "id"> & {
      id: DashboardId;
      model: "dashboard";
      collection_id: CollectionId | null;
    });

export type CollectionPickerOptions = EntityPickerModalOptions & {
  namespace?: "snippets";
  allowCreateNew?: boolean;
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  showLibrary?: boolean;
};

export type CollectionItemListProps = ListProps<
  CollectionItemId,
  CollectionPickerModel,
  CollectionPickerItem,
  ListCollectionItemsRequest,
  CollectionPickerOptions
>;

export type CollectionPickerStatePath = PickerState<
  CollectionPickerItem,
  ListCollectionItemsRequest
>;
