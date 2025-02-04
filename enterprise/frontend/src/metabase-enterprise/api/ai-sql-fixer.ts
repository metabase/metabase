import type {
  FixNativeQueryRequest,
  FixNativeQueryResponse,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const aiSqlFixerApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getFixedNativeQuery: builder.query<
      FixNativeQueryResponse,
      FixNativeQueryRequest
    >({
      query: body => ({
        method: "POST",
        url: "/api/ee/ai-sql-fixer/fix",
        body,
      }),
    }),
  }),
});

export const { useGetFixedNativeQueryQuery } = aiSqlFixerApi;
