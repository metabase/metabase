import type {
  CollectionId,
  SearchModelType,
  SearchResult,
} from "metabase-types/api";

import type { TypeWithModel } from "../../types";
import type { EntityPickerModalOptions } from "../EntityPickerModal";

export type CollectionPickerItem = TypeWithModel<
  CollectionId,
  SearchModelType
> &
  Pick<Partial<SearchResult>, "description" | "can_write"> & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
  };

export type CollectionPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};
