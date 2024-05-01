import { trackSchemaEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const trackColumnExtractViaHeader = (
  query: Lib.Query,
  stageIndex: number,
  extraction: Lib.ColumnExtraction,
  question?: Question,
) => {
  trackSchemaEvent("question", "1-0-4", {
    event: "column_extract_via_column_header",
    custom_expressions_used: Lib.functionsUsedByExtraction(
      query,
      stageIndex,
      extraction,
    ),
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};
