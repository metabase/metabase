import type { TokenStatus } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

export const premiumFeaturesApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getTokenStatus: builder.query<TokenStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/premium-features/token/status",
      }),
    }),
    refreshTokenStatus: builder.mutation<TokenStatus, void>({
      query: () => ({
        method: "POST",
        url: "/api/premium-features/token/refresh",
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const { useGetTokenStatusQuery, useRefreshTokenStatusMutation } =
  premiumFeaturesApi;
