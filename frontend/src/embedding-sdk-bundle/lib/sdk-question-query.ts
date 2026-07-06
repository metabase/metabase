import { deserializeCardFromQuery } from "metabase/common/utils/card";
import type { UnsavedCard } from "metabase-types/api";

export function getCardFromSdkQuestionQuery(
  query: string | undefined,
): UnsavedCard | undefined {
  if (!query) {
    return undefined;
  }

  return deserializeCardFromQuery(query);
}
