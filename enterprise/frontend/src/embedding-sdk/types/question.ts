import type { ReactNode } from "react";

import type { ParameterValues } from "embedding-sdk/components/private/InteractiveQuestion/context";
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
  initialSqlParameters?: ParameterValues;
}

export interface NavigateToNewCardParams {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
  cancelDeferred?: Deferred;
}

export interface QuestionStateParams {
  question: Question;
  updateQuestion: (question: Question, opts: { run: boolean }) => void;
}

export type SdkQuestionTitleProps =
  | boolean
  | undefined
  | ReactNode
  // TODO: turn this into (question: Question) => ReactNode once we have the public-facing question type (metabase#50487)
  | (() => ReactNode);
