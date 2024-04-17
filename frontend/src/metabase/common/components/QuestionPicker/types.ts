import type {
  CardId,
  CollectionId,
  CollectionItemModel,
  DashboardId,
  SearchModel,
  SearchRequest,
  SearchResult,
} from "metabase-types/api";

import type {
  EntityPickerModalOptions,
  ListProps,
  TypeWithModel,
} from "../EntityPicker";

export type QuestionPickerModel = Extract<
  QuestionPickerItem["model"],
  "card" | "dataset" | "collection"
>;
export type QuestionPickerValueModel = Extract<
  QuestionPickerItem["model"],
  "card" | "dataset"
>;

export type QuestionPickerValueItem = QuestionPickerItem & {
  id: CardId;
  model: QuestionPickerValueModel;
};

export type QuestionPickerItem = TypeWithModel<
  QuestionPickerItemId,
  QuestionPickerItemModel
> &
  Pick<Partial<SearchResult>, "description" | "can_write"> & {
    location?: string | null;
    effective_location?: string | null;
    is_personal?: boolean;
    collection_id?: CollectionId;
    here?: CollectionItemModel[];
    below?: CollectionItemModel[];
  };

export type QuestionPickerOptions = EntityPickerModalOptions & {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
};

export type QuestionItemListProps = ListProps<
  QuestionPickerItemId,
  SearchModel,
  QuestionPickerItem,
  SearchRequest,
  QuestionPickerOptions
>;

export type QuestionPickerItemId = CollectionId | CardId | DashboardId;

export type QuestionPickerItemModel = Extract<
  SearchModel,
  "collection" | "card" | "dataset" | "dashboard"
>;
