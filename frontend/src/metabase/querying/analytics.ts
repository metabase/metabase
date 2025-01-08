import { trackSchemaEvent } from "metabase/lib/analytics";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export const trackColumnCombineViaColumnHeader = (
  query: Lib.Query,
  question?: Question,
) => {
  trackSchemaEvent("question", {
    event: "column_combine_via_column_header",
    custom_expressions_used: ["concat"],
    database_id: Lib.databaseID(query),
    question_id: question?.id() ?? 0,
  });
};

export const trackColumnExtractViaHeader = (
  query: Lib.Query,
  stageIndex: number,
  extraction: Lib.ColumnExtraction,
  question?: Question,
) => {
  trackSchemaEvent("question", {
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

export const trackColumnCompareViaColumnHeader = (
  query: Lib.Query,
  stageIndex: number,
  expressions: Lib.ExpressionClause[],
  questionId?: number,
) => {
  trackSchemaEvent("question", {
    event: "column_compare_via_column_header",
    custom_expressions_used: expressions.flatMap(expression =>
      Lib.functionsUsedByExpression(query, stageIndex, expression),
    ),
    database_id: Lib.databaseID(query),
    question_id: questionId ?? 0,
  });
};

export const trackColumnCompareViaPlusModal = (
  query: Lib.Query,
  stageIndex: number,
  expressions: Lib.ExpressionClause[],
  questionId?: number,
) => {
  trackSchemaEvent("question", {
    event: "column_compare_via_plus_modal",
    custom_expressions_used: expressions.flatMap(expression =>
      Lib.functionsUsedByExpression(query, stageIndex, expression),
    ),
    database_id: Lib.databaseID(query),
    question_id: questionId ?? 0,
  });
};
