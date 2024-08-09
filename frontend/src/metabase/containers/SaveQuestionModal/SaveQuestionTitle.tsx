import { useSaveQuestionContext } from "metabase/containers/SaveQuestionModal/context";
import { getTitle } from "metabase/containers/SaveQuestionModal/util";

export const SaveQuestionTitle = () => {
  const { question, showSaveType, multiStep } = useSaveQuestionContext();
  const cardType = question.type();

  return getTitle(cardType, showSaveType, multiStep);
};
