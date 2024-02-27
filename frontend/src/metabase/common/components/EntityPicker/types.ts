import type { IconName } from "metabase/ui";
import type {
  SearchResult,
  SearchListQuery,
  SearchModelType,
  CollectionId,
} from "metabase-types/api";

import type { CollectionPickerOptions } from "./components/CollectionPicker";
import type { EntityPickerModalOptions } from "./components/EntityPickerModal";

export type TypeWithModel = {
  id: any;
  name: string;
  model: SearchModelType;
};

export type TisFolder<TItem extends TypeWithModel> = (item: TItem) => boolean;

export type PickerState<T> = PickerStateItem<T>[];

export type PickerStateItem<T> = EntityPickerStateItem<T>;

type EntityPickerStateItem<T> = {
  query?: SearchListQuery;
  selectedItem: T | any | null;
};

export type EntityPickerOptions = EntityPickerModalOptions &
  CollectionPickerOptions;

export type CollectionPickerItem = Pick<
  SearchResult,
  "name" | "description" | "can_write" | "model"
> & {
  id: CollectionId;
  location?: string | null;
  effective_location?: string | null;
  is_personal?: boolean;
};

export type EntityTab = {
  element: JSX.Element;
  displayName: string;
  model: string;
  icon: IconName;
};
