import type { ReactNode } from "react";

import type { Deferred } from "metabase/lib/promise";
import type { QueryParams } from "metabase/query_builder/actions";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type InternalQuestion from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

import type { SdkDashboardId } from "./dashboard";
import type { SdkEntityId } from "./entity-id";

export type { MetabaseQuestion } from "metabase/embedding-sdk/types/question";

export type SdkQuestionId = number | "new" | SdkEntityId;

export interface SdkQuestionState {
  question?: InternalQuestion;
  originalQuestion?: InternalQuestion;
  queryResults?: any[];
}

export type LoadSdkQuestionParams = {
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
  questionId?: SdkQuestionId | null;

  /**
   * @internal
   * The ID of the dashboard to save the question to. If provided, the question will be saved to this dashboard instead of the target collection or dashboards.
   * And the collection and dashboard picker will not be shown.
   */
  targetDashboardId?: SdkDashboardId | null;
};

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

export type EntityTypeFilterKeys = "table" | "model";

export type SqlParameterValues = Record<
  string,
  | string
  | number
  | boolean
  | Array<string | number | boolean | null>
  | null
  | undefined
>;
