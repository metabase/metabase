import type { Card, CardType } from "metabase-types/api";

import type {
  QuestionPickerValueItem,
  QuestionPickerValueModel,
} from "./types";

const getQuestionPickerValueModel = (
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

export const getQuestionPickerValue = ({
  id,
  type,
}: Pick<Card, "id" | "type">): QuestionPickerValueItem => {
  return { id, model: getQuestionPickerValueModel(type) };
};
