import _ from "underscore";

import type { Card, CardType } from "metabase-types/api";

import type { CollectionPickerItem } from "../CollectionPicker";
import {
  type TablePickerFolderItem,
  type TablePickerItem,
  isTablePickerFolder,
} from "../TablePicker";

import type {
  QuestionPickerItem,
  QuestionPickerModel,
  QuestionPickerValue,
  QuestionPickerValueModel,
} from "./types";

export const isFolder = (
  item: QuestionPickerItem,
  models: QuestionPickerModel[],
) => {
  return (
    item.id === "root" ||
    (item as CollectionPickerItem).is_personal ||
    ((item?.model === "collection" || item?.model === "dashboard") &&
      _.intersection([...(item?.below ?? []), ...(item?.here ?? [])], models)
        .length > 0)
  );
};

export const isTablePickerFolderOrQuestionPickerFolder = (
  item: QuestionPickerItem | TablePickerItem,
  models: QuestionPickerModel[],
): item is TablePickerFolderItem | QuestionPickerItem => {
  return isTablePickerFolder(item) || isFolder(item, models);
};

export const getQuestionPickerValue = ({
  id,
  type,
}: Pick<Card, "id" | "type">): QuestionPickerValue => {
  return { id, model: getQuestionPickerValueModel(type) };
};

export const getQuestionPickerValueModel = (
  type: CardType,
): QuestionPickerValueModel => {
  switch (type) {
    case "question":
      return "card";
    case "model":
      return "dataset";
    case "metric":
      return "metric";
  }
};
