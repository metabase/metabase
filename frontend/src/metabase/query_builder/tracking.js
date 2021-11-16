import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackNewQuestionSaved = (
  draftQuestion,
  createdQuestion,
  originalQuestion,
) => {
  trackSchemaEvent("question", "1-0-1", {
    event: "new_question_saved",
    question_id: createdQuestion.id(),
    database_id: createdQuestion.databaseId(),
    visualization_type: createdQuestion.display(),
    type: draftQuestion.creationType(),
    source: originalQuestion ? "existing_question" : "from_scratch",
  });
};
