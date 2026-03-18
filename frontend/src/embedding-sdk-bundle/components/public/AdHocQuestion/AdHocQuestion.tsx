import { useMemo } from "react";
import { t } from "ttag";

import {
  SdkError,
  withPublicComponentWrapper,
} from "embedding-sdk-bundle/components/private/PublicComponentWrapper";
import {
  SdkQuestion,
  type SdkQuestionProps,
} from "embedding-sdk-bundle/components/public/SdkQuestion/SdkQuestion";
import { b64_to_utf8 } from "metabase/lib/encoding";
import type { Card } from "metabase-types/api";

/**
 * @internal Not part of the public API yet. Do not use in external integrations.
 * @interface
 * @expand
 * @category AdHocQuestion
 */
export type AdHocQuestionProps = Omit<
  SdkQuestionProps,
  | "questionId"
  | "token"
  | "deserializedCard"
  | "getClickActionMode"
  | "navigateToNewCard"
  | "backToDashboard"
> & {
  /**
   * Base64-encoded MBQL query to run as an ad-hoc question.
   *
   * The query should be a JSON object encoded in base64. For example:
   * ```
   * btoa(JSON.stringify({
   *   "lib/type": "mbql/query",
   *   "database": 2,
   *   "stages": [{ "lib/type": "mbql.stage/mbql", "source-table": 73 }]
   * }))
   * ```
   */
  query: string;
};

const AdHocQuestionInner = ({ query, ...props }: AdHocQuestionProps) => {
  const deserializedCard = useMemo((): Card | null => {
    try {
      const decodedQuery = JSON.parse(b64_to_utf8(query));

      return {
        display: "table",
        dataset_query: decodedQuery,
        visualization_settings: {},
      } as Card;
    } catch {
      return null;
    }
  }, [query]);

  if (!deserializedCard) {
    return <SdkError message={t`Question not found`} />;
  }

  return (
    <SdkQuestion
      questionId={null}
      deserializedCard={deserializedCard}
      {...props}
    />
  );
};

export const AdHocQuestion = withPublicComponentWrapper(AdHocQuestionInner, {
  supportsGuestEmbed: false,
});
