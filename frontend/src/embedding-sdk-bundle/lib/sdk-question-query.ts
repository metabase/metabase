import type { SdkQuestionEntityInternalProps } from "embedding-sdk-bundle/types/question";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import type { DatasetQuery, UnsavedCard } from "metabase-types/api";

export function getCardFromSdkQuestionQuery(
  query: SdkQuestionEntityInternalProps["query"] | undefined,
): UnsavedCard | undefined {
  if (!query) {
    return undefined;
  }

  if (typeof query === "string") {
    return deserializeCardFromQuery(query);
  }

  return {
    dataset_query: query as DatasetQuery,
    display: "table",
    visualization_settings: {},
  };
}
