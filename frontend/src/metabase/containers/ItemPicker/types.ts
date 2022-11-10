import { IconProps } from "metabase/components/Icon";

import type { Collection } from "metabase-types/api";

export type PickerModel =
  | "card"
  | "collection"
  | "dataset"
  | "dashboard"
  | "page";

export type PickerItemId = number | null;

export type PickerValue = { id: PickerItemId; model: PickerModel };

export type PickerItem = {
  id: PickerItemId;
  model: PickerModel;
  collection_id: Collection["id"];
  can_write: boolean;

  // Coming from `wrapped` entities
  getName: () => string;
  getColor: () => string;
  getIcon: () => IconProps;
};

export type CollectionPickerItem = PickerItem & Collection;

export type SearchQuery = {
  q?: string;
  collection?: Collection["id"];
  models?: PickerModel[];
};
