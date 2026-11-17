import { Api } from "metabase/api/api";
import type * as Lib from "metabase-lib";

type GenerateExpressionRequest = {
  prompt: string;
  source: string;
  cursor?: number;
  expression_mode: Lib.ExpressionMode;
  columns: string[];
  /** Sample values of a column, by the column name in `columns`. */
  column_values?: Record<string, string[]>;
  name?: string;
  has_default_name?: boolean;
  /** The current group-by columns of an aggregation, like `[Created At: Month]`. */
  breakouts?: string[];
  previous_attempts?: { expression: string; error: string }[];
};

/** A group-by column from the AI, like `[Created At]` and the unit "month". */
export type GeneratedBreakout = { column: string; unit?: string };

type GenerateExpressionResponse =
  | { expression: string; name?: string; breakouts?: GeneratedBreakout[] }
  /** The request is not possible with a custom expression. */
  | { message: string };

const generateExpressionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    generateExpression: builder.mutation<
      GenerateExpressionResponse,
      GenerateExpressionRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/prototype/expression/generate",
        body,
      }),
    }),
  }),
});

export const { useGenerateExpressionMutation } = generateExpressionApi;
