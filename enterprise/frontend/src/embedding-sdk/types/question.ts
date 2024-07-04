import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

export interface SdkQuestionResult {
  question?: Question;
  queryResults?: any[];
}

export type NavigateToNewCardParams = {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
};
