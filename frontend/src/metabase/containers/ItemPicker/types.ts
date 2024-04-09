import type { IconProps } from "metabase/ui";
import type { Collection } from "metabase-types/api";

export type PickerModel = "card" | "collection" | "dataset" | "dashboard";

export type PickerValue<TId> = { id: TId; model: PickerModel };

export type PickerItem<TId> = {
  id: TId;
  model: PickerModel;
  collection_id: Collection["id"];
  can_write: boolean;

  // Coming from `wrapped` entities
  getName: () => string;
  getColor: () => string;
  getIcon: () => IconProps;
};

export type CollectionPickerItem<T> = PickerItem<T> & Collection;

export type SearchQuery = {
  q?: string;
  collection?: Collection["id"];
  models?: PickerModel[];
  filter_items_in_personal_collection?: FilterItemsInPersonalCollection;
};

export type FilterItemsInPersonalCollection = "only" | "exclude";
