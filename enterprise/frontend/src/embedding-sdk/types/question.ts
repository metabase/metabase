import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

export interface SdkQuestionResult {
  card?: Card;
  question?: Question;

  // TODO: do we have a proper type for query results?
  queryResults?: any[];
}
