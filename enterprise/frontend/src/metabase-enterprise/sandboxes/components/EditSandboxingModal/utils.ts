import _ from "underscore";

import type {
  QuestionPickerItem,
  QuestionPickerModel,
} from "metabase/common/components/Pickers/QuestionPicker";

export const shouldDisableItem = (
  item: QuestionPickerItem,
  models?: QuestionPickerModel[],
) =>
  !(
    isRootCollection(item) ||
    isPersonalCollection(item) ||
    isCollectionWithModels(item, models) ||
    item.model === "dataset" ||
    item.model === "card"
  );

const isRootCollection = (item: QuestionPickerItem) => item.id === "root";
const isPersonalCollection = (item: QuestionPickerItem) =>
  item.model === "collection" && item.is_personal && item.location === "/";
const isCollectionWithModels = (
  item: QuestionPickerItem,
  models: QuestionPickerModel[] = [],
) =>
  (item.model === "collection" || item.model === "dashboard") &&
  _.intersection([...(item.below || []), ...(item.here || [])], models).length >
    0;
