import type {
  CollectionId,
  ListCollectionItemsRequest,
  SearchResult,
  CollectionItemModel,
  DashboardId,
  CardId,
} from "metabase-types/api";

import type {
  EntityPickerModalOptions,
  ListProps,
  TypeWithModel,
} from "../EntityPicker";

export type CollectionItemId = CollectionId | CardId | DashboardId;

// internally, this picker supports all items that live in collections
// so that we can use its components for picking all of them
export type CollectionPickerModel = Extract<
  CollectionItemModel,
  "collection" | "card" | "dataset" | "dashboard"
>;

// we can enforce type safety at the boundary of a collection-only picker with this type
export type CollectionPickerValueModel = Extract<
  CollectionPickerModel,
  "collection"
>;

export type CollectionPickerItem = TypeWithModel<
  CollectionItemId,
  CollectionPickerModel
> &
  Pick<Partial<SearchResult>, "description" | "can_write"> & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
  };

export type CollectionPickerValueItem = Omit<CollectionPickerItem, "model"> & {
  id: CollectionId;
  model: CollectionPickerValueModel;
};

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
