import { useSaveQuestionContext } from "./context";
import { getTitle } from "./util";

export const SaveQuestionTitle = () => {
  const { question, showSaveType, multiStep } = useSaveQuestionContext();
  const cardType = question.type();

  return getTitle(cardType, showSaveType, multiStep);
};
