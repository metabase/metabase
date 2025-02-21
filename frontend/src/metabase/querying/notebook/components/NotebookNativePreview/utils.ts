import { formatNativeQuery } from "metabase/lib/engine";
import type Question from "metabase-lib/v1/Question";
import type { NativeDatasetResponse } from "metabase-types/api";

export function createNativeQuestion(
  question: Question,
  response: NativeDatasetResponse | undefined,
) {
  const database = question.database();
  const query = formatNativeQuery(response?.query, database?.engine) ?? "";

  return question.setDatasetQuery({
    type: "native",
    native: {
      query,
      "template-tags": {},
      ...(response?.collection ? { collection: response.collection } : {}),
    },
    database: question.databaseId(),
  });
}
