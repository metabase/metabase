import type Question from "metabase-lib/v1/Question";
import type { Card, DatasetData } from "metabase-types/api";

export interface SdkQuestionResult {
  card?: Card;
  question?: Question;
  queryResults?: DatasetData[];
}
