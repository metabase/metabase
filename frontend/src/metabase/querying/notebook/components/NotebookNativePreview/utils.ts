import { formatNativeQuery } from "metabase/databases/utils/engine";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeDatasetResponse } from "metabase-types/api";

export function createNativeQuestion(
  question: Question,
  response: NativeDatasetResponse | undefined,
  metadataProvider: Lib.MetadataProvider,
): Question | undefined {
  const query = question.query();
  const databaseId = Lib.databaseID(query);
  if (
    response == null ||
    databaseId == null ||
    Lib.databaseMetadata(query) == null
  ) {
    return;
  }

  const rawQuery = formatNativeQuery(response.query);
  const newQuery = Lib.nativeQuery(databaseId, metadataProvider, rawQuery);
  const newQueryWithCollection =
    response.collection != null
      ? Lib.withNativeExtras(newQuery, { collection: response.collection })
      : newQuery;

  return question.setQuery(newQueryWithCollection);
}
