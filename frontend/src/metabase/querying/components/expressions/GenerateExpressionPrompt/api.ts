import { Api } from "metabase/api/api";
import type * as Lib from "metabase-lib";

type GenerateExpressionRequest = {
  prompt: string;
  source: string;
  expression_mode: Lib.ExpressionMode;
  columns: string[];
  name?: string;
  has_default_name?: boolean;
  previous_attempts?: { expression: string; error: string }[];
};

type GenerateExpressionResponse =
  | { expression: string; name?: string }
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
