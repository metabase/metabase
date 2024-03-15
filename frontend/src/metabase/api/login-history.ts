import { Api } from "metabase/api";
import type { UserLoginHistory } from "metabase-types/api";

export const loginHistoryApi = Api.injectEndpoints({
  endpoints: builder => ({
    getLoginHistory: builder.query<UserLoginHistory, void>({
      query: () => ({
        method: "GET",
        url: "/api/login-history/current",
      }),
    }),
  }),
});

export const { useGetLoginHistoryQuery } = loginHistoryApi;
