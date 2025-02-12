import type Question from "metabase-lib/v1/Question";
import type { TableId } from "metabase-types/api";

export const getTableIdFromQuestion = (
  question: Question,
): TableId | undefined => {
  const table = question.legacyQueryTable();
  const tableId = question.card()?.table_id ?? table?.id;

  return tableId;
};
