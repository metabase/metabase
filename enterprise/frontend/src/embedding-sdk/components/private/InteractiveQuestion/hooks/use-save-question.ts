import type { FormValues } from "metabase/components/SaveQuestionForm/types";
import { submitQuestion } from "metabase/components/SaveQuestionForm/util";

import { useInteractiveQuestionContext } from "../context";

export const useCreateQuestion = () => {
  const { question, originalQuestion, onSave, onCreate, saveToCollectionId } =
    useInteractiveQuestionContext();

  return async ({
    name,
    description,
    collection_id = saveToCollectionId,
  }: FormValues) => {
    if (!question) {
      throw new Error("Let's figure out something useful to write here");
    }
    return submitQuestion({
      originalQuestion,
      question,
      details: {
        name,
        description,
        saveType: "overwrite",
        collection_id,
        dashboard_id: undefined,
        tab_id: undefined,
      },
      onSave,
      onCreate,
      saveToCollectionId,
    });
  };
};

export const useUpdateQuestion = () => {};
