import type {
  CardId,
  CollectionId,
  CollectionItemModel,
  DashboardId,
  ListCollectionItemsRequest,
  SearchResult,
} from "metabase-types/api";

import type {
  EntityPickerModalOptions,
  ListProps,
  PickerState,
  TypeWithModel,
} from "../EntityPicker";

export type CollectionItemId = CollectionId | CardId | DashboardId;

// internally, this picker supports all items that live in collections
// so that we can use its components for picking all of them
export type CollectionPickerModel = Extract<
  CollectionItemModel,
  "collection" | "card" | "dataset" | "metric" | "dashboard"
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
  Pick<Partial<SearchResult>, "description" | "can_write"> & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId | null;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
  };

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
  allowCreateNew?: boolean;
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
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
