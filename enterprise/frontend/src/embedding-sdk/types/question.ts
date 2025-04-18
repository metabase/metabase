import type { ReactNode } from "react";

import type { MetabaseQuestion as InternalMetabaseQuestion } from "metabase/embedding-sdk/types/question";
import type { Deferred } from "metabase/lib/promise";
import type { QueryParams } from "metabase/query_builder/actions";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type InternalQuestion from "metabase-lib/v1/Question";
import type { Card, CardId, ParameterId } from "metabase-types/api";

import type { SdkEntityId } from "./entity-id";

export type SdkQuestionId = number | "new" | SdkEntityId;

/**
 * Inline wrapper to properly display the `MetabaseQuestion` type without referencing the `internal` type
 *
 * @inline
 * @interface
 */
interface _MetabaseQuestion extends InternalMetabaseQuestion {}

/**
 * The Question entity
 */
export type MetabaseQuestion = _MetabaseQuestion;

export interface SdkQuestionState {
  question?: InternalQuestion;
  originalQuestion?: InternalQuestion;
  queryResults?: any[];
}

export interface LoadSdkQuestionParams {
  /**
   * For SQL questions only. A mapping of SQL parameter names to parameter values, such as `{ product_id: "42"}`
   */
  initialSqlParameters?: SqlParameterValues;

  /**
   * @internal
   */
  options?: QueryParams;

  /**
   * @internal
   */
  deserializedCard?: Card;

  /**
   * @internal
   */
  questionId?: CardId | null;
}

export interface NavigateToNewCardParams {
  nextCard: Card;
  previousCard: Card;
  objectId: ObjectId;
  cancelDeferred?: Deferred;
}

export interface QuestionStateParams {
  question: InternalQuestion;
  updateQuestion: (question: InternalQuestion, opts: { run: boolean }) => void;
}

export type SdkQuestionTitleProps =
  | boolean
  | undefined
  | ReactNode
  // TODO: turn this into (question: Question) => ReactNode once we have the public-facing question type (metabase#50487)
  | (() => ReactNode);

export type EntityTypeFilterKeys = "table" | "question" | "model" | "metric";

export type SqlParameterValues = Record<ParameterId, string | number>;
