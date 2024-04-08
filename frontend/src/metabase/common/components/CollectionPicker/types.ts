import type {
  CollectionId,
  SearchRequest,
  SearchModelType,
  SearchResult,
  CollectionItemModel,
} from "metabase-types/api";

import type {
  EntityPickerModalOptions,
  ListProps,
  TypeWithModel,
} from "../EntityPicker";

export type CollectionPickerItem = TypeWithModel<
  CollectionId,
  SearchModelType
> &
  Pick<Partial<SearchResult>, "description" | "can_write"> & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
  };

export type CollectionPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

export type CollectionItemListProps = ListProps<
  CollectionId,
  SearchModelType,
  CollectionPickerItem,
  SearchRequest,
  CollectionPickerOptions
>;
