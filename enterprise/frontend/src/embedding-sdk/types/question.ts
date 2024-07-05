import type { LocationDescriptorObject } from "history";

import type { QueryParams } from "metabase/query_builder/actions";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

export interface SdkQuestionResult {
  question?: Question;
  queryResults?: any[];
}

export interface LoadSdkQuestionParams {
  location: LocationDescriptorObject;
  params: QueryParams;
}

export interface NavigateToNewCardParams {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
}
