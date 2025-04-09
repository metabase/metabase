import type { SdkQuestionId } from "embedding-sdk/types/question";

export type InteractiveQuestionQuestionIdProps = {
  /**
   * The ID of the question.
   * This is either:
   * - The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`
   * - The `entity_id` key of the question object. You can find a question's Entity ID in the info panel when viewing a question
   * - `new` to show the notebook editor for creating new questions. `isSaveEnabled` must be `true` to allow saving the question
   */
  questionId: SdkQuestionId | null;
};
