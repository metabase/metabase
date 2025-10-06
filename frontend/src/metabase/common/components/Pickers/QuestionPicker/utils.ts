import _ from "underscore";

import type { Card, CardType, CollectionItemModel } from "metabase-types/api";

import type {
  QuestionPickerItem,
  QuestionPickerValue,
  QuestionPickerValueModel,
} from "./types";

export const isFolder = (
  item: QuestionPickerItem,
  models: CollectionItemModel[],
) => {
  return (
    item.id === "root" ||
    item.is_personal ||
    ((item?.model === "collection" || item?.model === "dashboard") &&
      _.intersection([...(item?.below ?? []), ...(item?.here ?? [])], models)
        .length > 0)
  );
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
