import type { SearchRequest, SearchModel, CardId } from "metabase-types/api";

import type {
  CollectionItemId,
  CollectionPickerItem,
} from "../CollectionPicker";
import type { EntityPickerModalOptions, ListProps } from "../EntityPicker";

export type DashboardPickerModel = Extract<
  CollectionPickerItem["model"],
  "dashboard" | "collection"
>;
export type DashboardPickerValueModel = Extract<
  CollectionPickerItem["model"],
  "dashboard"
>;

export type DashboardPickerValueItem = CollectionPickerItem & {
  id: CardId;
  model: DashboardPickerValueModel;
};

// we could tighten this up in the future, but there's relatively little value to it
export type DashboardPickerItem = CollectionPickerItem;

export type DashboardPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
};

export type DashboardItemListProps = ListProps<
  CollectionItemId,
  SearchModel,
  DashboardPickerItem,
  SearchRequest,
  DashboardPickerOptions
>;
