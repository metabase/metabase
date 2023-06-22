import { IconProps } from "metabase/core/components/Icon";

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
};
