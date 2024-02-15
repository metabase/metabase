import type { DatasetQuery } from "metabase-types/api";
import { checkNotNull } from "metabase/lib/types";
import type Question from "metabase-lib/Question";

export function createDatasetQuery(
  query: string,
  question: Question,
): DatasetQuery {
  const tableId = question.legacyQueryTableId();
  const collection =
    tableId === null || typeof tableId === "undefined"
      ? undefined
      : question.metadata().tables[tableId]?.name;

  return {
    type: "native",
    native: { query, "template-tags": {}, collection },
    database: checkNotNull(question.databaseId()),
  };
}
