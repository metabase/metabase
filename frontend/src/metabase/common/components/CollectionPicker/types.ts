import type {
  CollectionId,
  CollectionItemModel,
  SearchModel,
  SearchResult,
} from "metabase-types/api";

import type { EntityPickerModalOptions, TypeWithModel } from "../EntityPicker";

export type CollectionPickerItem = TypeWithModel<CollectionId, SearchModel> &
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
