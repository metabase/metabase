import type { MetabaseQueryObject } from "embedding-sdk-bundle/types/question";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import type { DatasetQuery, UnsavedCard } from "metabase-types/api";

export function getCardFromSdkQuestionQuery(
  query: string | MetabaseQueryObject | null | undefined,
): UnsavedCard | undefined {
  if (query == null) {
    return undefined;
  }

  if (typeof query === "string") {
    return deserializeCardFromQuery(query);
  }

  return {
    // `MetabaseQueryObject` is the public structural mirror of `DatasetQuery`
    // and deliberately omits its opaque marker, so it cannot be assigned to the
    // internal type without an assertion.
    dataset_query: query as DatasetQuery,
    display: "table",
    visualization_settings: {},
  };
}
