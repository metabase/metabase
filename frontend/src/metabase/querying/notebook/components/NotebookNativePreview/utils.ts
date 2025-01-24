import { formatNativeQuery } from "metabase/lib/engine";
import type Question from "metabase-lib/v1/Question";
import type { NativeQueryForm } from "metabase-types/api";

export function createNativeQuestion(
  question: Question,
  nativeForm: NativeQueryForm | undefined,
) {
  const database = question.database();
  if (!database || nativeForm) {
    return question;
  }

  const { query, collection } = nativeForm;
  const formattedQuery = formatNativeQuery(query, database.engine);
  if (!formattedQuery) {
    return question;
  }

  return question.setDatasetQuery({
    type: "native",
    native: {
      query: formattedQuery,
      "template-tags": {},
      ...(collection ? { collection } : {}),
    },
    database: database.id,
  });
}
