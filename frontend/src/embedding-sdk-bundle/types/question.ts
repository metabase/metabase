import type { ReactNode } from "react";

import type { Deferred } from "metabase/lib/promise";
import type { QueryParams } from "metabase/query_builder/actions";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type InternalQuestion from "metabase-lib/v1/Question";
import type { Card, ParameterValuesMap } from "metabase-types/api";

import type { SdkDashboardId } from "./dashboard";
import type { SdkEntityId, SdkEntityToken } from "./entity";

export type { MetabaseQuestion } from "metabase/embedding-sdk/types/question";

/**
 * Represents the identifier for a question in the Metabase SDK.
 *
 * @example
 * ```typescript
 * // Numerical ID from question URL
 * const questionId: SdkQuestionId = 123;
 *
 * // Entity ID string
 * const questionId: SdkQuestionId = "abc123def456";
 *
 * // Create new notebook-style question
 * const questionId: SdkQuestionId = "new";
 *
 * // Create new native SQL question
 * const questionId: SdkQuestionId = "new-native";
 * ```
 */
export type SdkQuestionId =
  | number // Numerical question ID (e.g., 123)
  | "new" // Create new notebook-style question
  | "new-native" // Create new native SQL question
  | SdkEntityId; // Entity ID string (e.g., "abc123def456")

export type SdkQuestionEntityPublicProps =
  | {
      /**
       * The ID of the question.
       *  <br/>
       * This is either:
       *  <br/>
       *  - the numerical ID when accessing a question link, i.e. `http://localhost:3000/question/1-my-question` where the ID is `1`
       *  <br/>
       *  - the string ID found in the `entity_id` key of the question object when using the API directly or using the SDK Collection Browser to return data
       *  <br/>
       *  - `new` to show the notebook editor for creating new questions
       *  <br/>
       *  - `new-native` to show the SQL editor for creating new native questions
       */
      questionId: SdkQuestionId | null;
      token?: never;
    }
  | {
      questionId?: never;
      /**
       * A valid JWT token for the guest embed.
       */
      token: SdkEntityToken | null;
    };

export interface SdkQuestionState {
  question?: InternalQuestion;
  originalQuestion?: InternalQuestion;
  token?: SdkEntityToken | null;
  queryResults?: any[];
  parameterValues?: ParameterValuesMap;
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
