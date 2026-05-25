import { Api } from "./api";

interface BigQueryOAuthStatus {
  connected: boolean;
  email?: string | null;
}

export const googleBigQueryApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    getBigQueryOAuthStatus: builder.query<BigQueryOAuthStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/google-bigquery/status",
      }),
      providesTags: ["bigquery-oauth"],
    }),
    getBigQueryOAuthAuthorizeUrl: builder.query<{ url: string }, void>({
      query: () => ({
        method: "GET",
        url: "/api/google-bigquery/authorize",
      }),
    }),
    disconnectBigQueryOAuth: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/google-bigquery/connection",
      }),
      invalidatesTags: ["bigquery-oauth"],
    }),
  }),
});

export const {
  useGetBigQueryOAuthStatusQuery,
  useLazyGetBigQueryOAuthAuthorizeUrlQuery,
  useDisconnectBigQueryOAuthMutation,
} = googleBigQueryApi;
