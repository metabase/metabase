import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

export function createDatasetQuery(
  queryText: string,
  question: Question,
): DatasetQuery {
  const query = question.query();
  const databaseId = Lib.databaseID(query);
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId ? Lib.tableOrCardMetadata(query, tableId) : undefined;
  const tableName = table ? Lib.displayInfo(query, -1, table).name : undefined;
  const extras = tableName ? { collection: tableName } : {};

  return {
    type: "native",
    native: { query: queryText, "template-tags": {}, ...extras },
    database: databaseId,
  };
}

export function createNativeQuery(question: Question, query: string = "") {
  const databaseId = question.database()?.id;
  if (!databaseId) {
    return null;
  }

  const metadata = Lib.metadataProvider(databaseId, question.metadata());

  return Lib.nativeQuery(databaseId, metadata, query);
}
