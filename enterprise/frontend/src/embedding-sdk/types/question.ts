import type { LocationDescriptorObject } from "history";

import type { Deferred } from "metabase/lib/promise";
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
  cancelDeferred?: Deferred;
}

export interface NavigateToNewCardParams {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
  cancelDeferred?: Deferred;
}
