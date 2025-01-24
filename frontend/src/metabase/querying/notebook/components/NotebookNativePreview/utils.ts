import { formatNativeQuery } from "metabase/lib/engine";
import type Question from "metabase-lib/v1/Question";
import type { NativeDatasetResponse } from "metabase-types/api";

export function createNativeQuestion(
  question: Question,
  nativeForm: NativeDatasetResponse | undefined,
) {
  const database = question.database();
  const query = formatNativeQuery(nativeForm?.query, database?.engine) ?? "";

  return question.setDatasetQuery({
    type: "native",
    native: {
      query,
      "template-tags": {},
      ...(nativeForm?.collection ? { collection: nativeForm.collection } : {}),
    },
    database: question.databaseId(),
  });
}
