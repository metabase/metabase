import type { Deferred } from "metabase/lib/promise";
import type { QueryParams } from "metabase/query_builder/actions";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type Question from "metabase-lib/v1/Question";
import type { Card, CardId } from "metabase-types/api";

export interface SdkQuestionState {
  question?: Question;
  originalQuestion?: Question;
  queryResults?: any[];
}

export interface LoadSdkQuestionParams {
  options?: QueryParams;
  deserializedCard?: Card;
  cardId?: CardId | null;
  cancelDeferred?: Deferred;
}

export interface NavigateToNewCardParams {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
  cancelDeferred?: Deferred;
}
