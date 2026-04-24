import type { ErdResponse, GetErdRequest } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const erdApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getErd: builder.query<ErdResponse, GetErdRequest>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/dependencies/erd",
        params,
      }),
    }),
  }),
});

export const { useGetErdQuery } = erdApi;
