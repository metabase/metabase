import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackNewQuestionSaved = (
  draftQuestion,
  createdQuestion,
  isBasedOnExistingQuestion,
) => {
  trackSchemaEvent("question", "1-0-2", {
    event: "new_question_saved",
    question_id: createdQuestion.id(),
    database_id: createdQuestion.databaseId(),
    visualization_type: createdQuestion.display(),
    type: draftQuestion.creationType(),
    source: isBasedOnExistingQuestion ? "existing_question" : "from_scratch",
  });
};

export const trackTurnIntoModelClicked = question => {
  trackSchemaEvent("question", "1-0-2", {
    event: "turn_into_model_clicked",
    question_id: question.id(),
  });
};
