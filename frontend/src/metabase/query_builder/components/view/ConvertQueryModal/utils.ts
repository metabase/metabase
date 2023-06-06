import { DatasetQuery } from "metabase-types/api";
import { checkNotNull } from "metabase/core/utils/types";
import Question from "metabase-lib/Question";

export function createDatasetQuery(
  query: string,
  question: Question,
): DatasetQuery {
  const tableId = question.tableId();
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
