import { trackSchemaEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const trackColumnExtractViaHeader = (
  query: Lib.Query,
  tag: string,
  question?: Question,
) => {
  trackSchemaEvent("question", "1-0-4", {
    event: "column_combine_via_header",
    custom_expressions_used: expressionsUsedBy(tag),
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

function expressionsUsedBy(tag: string) {
  switch (tag) {
    case "hour-of-day":
      return ["hour"];
    case "day-of-month":
      return ["day"];
    case "day-of-week":
      return ["weekday"];
    case "month-of-year":
      return ["month"];
    case "quarter-of-year":
      return ["quarter"];
    case "year":
      return ["year"];
    case "domain":
      return ["domain"];
    case "host":
      return ["host"];
    case "subdomain":
      return ["subdomain"];
  }
  return [];
}
