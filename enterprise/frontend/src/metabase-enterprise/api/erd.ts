import type { ErdParams, ErdResponse } from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { listTag } from "./tags";

export const erdApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getErd: builder.query<ErdResponse, ErdParams>({
      query: (params) => ({
        method: "GET",
        url: "/api/ee/erd",
        params,
      }),
      providesTags: [listTag("erd")],
    }),
  }),
});

export const { useGetErdQuery } = erdApi;
