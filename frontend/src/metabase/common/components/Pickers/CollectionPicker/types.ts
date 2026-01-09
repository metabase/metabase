import type {
  CardId,
  CollectionId,
  CollectionItem,
  CollectionItemModel,
  CollectionNamespace,
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
  > &
  Partial<
    Pick<
      CollectionItem,
      | "is_shared_tenant_collection"
      | "is_tenant_dashboard"
      | "collection_namespace"
    >
  > & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId | null;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
    type?: CollectionType;
    namespace?: CollectionNamespace;
  };

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
  namespace?: CollectionNamespace;
  allowCreateNew?: boolean;
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  showLibrary?: boolean;
  /**
   * When set to "collection", allows saving to namespace root collections
   * (like tenant root). When null/undefined, namespace roots are disabled.
   */
  savingModel?: "collection" | null;
  /**
   * Restricts the picker to only show collections in a specific namespace.
   * - When set to "shared-tenant-collection", only the tenant root is shown.
   * - When set to "default", the tenant root is hidden and regular collections are shown.
   * - When undefined, all roots are shown (default behavior).
   */
  restrictToNamespace?: string;
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
