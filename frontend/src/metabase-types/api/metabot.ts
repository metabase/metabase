import { Card } from "./card";

export type MetabotFeedbackType =
  | "great"
  | "wrong-data"
  | "incorrect-result"
  | "invalid-sql";

export interface MetabotFeedbackPayload {
  feedback: MetabotFeedbackType;
  prompt: string;
  sql: string;
  correct_sql?: string;
  message?: string;
}

export interface MetabotPromptResult {
  card: Card;
  prompt_template_versions: string[] | null;
}
