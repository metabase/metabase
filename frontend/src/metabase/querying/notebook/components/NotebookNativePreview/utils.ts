import { formatNativeQuery } from "metabase/lib/engine";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { NativeDatasetResponse } from "metabase-types/api";

export function createNativeQuestion(
  question: Question,
  response: NativeDatasetResponse | undefined,
): Question | undefined {
  const database = question.database();
  if (response == null || database == null || database.engine == null) {
    return;
  }

  const metadataProvider = Lib.metadataProvider(
    database.id,
    question.metadata(),
  );
  const rawQuery = formatNativeQuery(response.query);
  const newQuery = Lib.nativeQuery(database.id, metadataProvider, rawQuery);
  const newQueryWithCollection =
    response.collection != null
      ? Lib.withNativeExtras(newQuery, { collection: response.collection })
      : newQuery;

  return question.setQuery(newQueryWithCollection);
}
