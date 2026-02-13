import type {
  CheckReplaceSourceInfo,
  CheckReplaceSourceRequest,
  ReplaceSourceRequest,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const replacementApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    checkReplaceSource: builder.query<
      CheckReplaceSourceInfo,
      CheckReplaceSourceRequest
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/check-replace-source",
        body,
      }),
    }),
    replaceSource: builder.mutation<void, ReplaceSourceRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/replacement/replace-source",
        body,
      }),
    }),
  }),
});

export const { useCheckReplaceSourceQuery, useReplaceSourceMutation } =
  replacementApi;
