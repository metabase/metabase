import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";

export type SdkQuestionIdProps = {
  /**
   * The ID of the question.
   *  <br/>
   * This is either:
   *  <br/>
   * - The numerical ID when accessing a question link, e.g., `http://localhost:3000/question/1-my-question` where the ID is `1`
   *  <br/>
   * - The `entity_id` key of the question object. You can find a question's Entity ID in the info panel when viewing a question
   *  <br/>
   * - `new` to show the notebook editor for creating new questions. `isSaveEnabled` must be `true` to allow saving the question
   *  <br/>
   * - `new-native` to show the SQL editor for creating new native questions. `isSaveEnabled` must be `true` to allow saving the question
   */
  questionId: SdkQuestionId | null;
};
