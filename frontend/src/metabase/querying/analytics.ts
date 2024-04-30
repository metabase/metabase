import { trackSchemaEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const trackColumnExtractViaHeader = (
  query: Lib.Query,
  question?: Question,
) => {
  trackSchemaEvent("question", "1-0-4", {
    event: "column_combine_via_header",
    custom_expressions_used: [],
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};
