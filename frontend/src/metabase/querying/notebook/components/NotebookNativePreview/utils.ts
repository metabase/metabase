import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { DatasetQuery, NativeQueryForm } from "metabase-types/api";

export function createDatasetQuery(
  question: Question,
  queryText: string,
  { collection }: NativeQueryForm,
): DatasetQuery {
  const query = question.query();
  const databaseId = Lib.databaseID(query);
  const extras = collection ? { collection } : {};

  return {
    type: "native",
    native: { query: queryText, "template-tags": {}, ...extras },
    database: databaseId,
  };
}

export function createNativeQuery(question: Question, query: string = "") {
  return new NativeQuery(question, {
    type: "native",
    database: question.database()?.id ?? null,
    native: {
      query,
    },
  });
}
