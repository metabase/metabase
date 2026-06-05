import { deserializeCardFromQuery } from "metabase/common/utils/card";
import type { DatasetQuery, UnsavedCard } from "metabase-types/api";

export function getCardFromSdkQuestionQuery(
  query: unknown | null | undefined,
): UnsavedCard | undefined {
  if (query == null) {
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
