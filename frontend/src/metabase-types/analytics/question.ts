import type { CardId, DatabaseId } from "metabase-types/api";

export type NewQuestionSavedEvent = {
  event: "new_question_saved";
  question_id: CardId;
  database_id?: DatabaseId;
  type?: "simple_question" | "custom_question" | "native_question";
  method?: "from_scratch" | "existing_question";
  visualization_type?: string;
};

export type TurnIntoModelClickedEvent = {
  event: "turn_into_model_clicked";
  question_id: CardId;
};

export type QuestionEvent = NewQuestionSavedEvent | TurnIntoModelClickedEvent;
