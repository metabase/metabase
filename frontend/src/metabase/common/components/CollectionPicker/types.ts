import type {
  CollectionId,
  SearchRequest,
  SearchModel,
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

export type CollectionPickerModel = Extract<
  SearchModel,
  "collection" | "card" | "dataset" | "dashboard"
>;

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
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

export type CollectionItemListProps = ListProps<
  CollectionItemId,
  CollectionPickerModel,
  CollectionPickerItem,
  SearchRequest,
  CollectionPickerOptions
>;
