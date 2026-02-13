import { invalidateTags, tag } from "metabase/api/tags";

import { EnterpriseApi } from "./api";

export interface OidcCheckRequest {
  "issuer-uri": string;
  "client-id": string;
  "client-secret"?: string | null;
  key?: string | null;
}

export interface OidcCheckStepResult {
  step: string;
  success: boolean;
  verified?: boolean;
  error?: string;
  "token-endpoint"?: string;
}

export interface OidcCheckResponse {
  ok: boolean;
  discovery: OidcCheckStepResult;
  credentials?: OidcCheckStepResult;
}

export interface CustomOidcConfig {
  key: string;
  "login-prompt": string;
  "issuer-uri": string;
  "client-id": string;
  "client-secret"?: string;
  scopes?: string[];
  enabled?: boolean;
  "auto-provision"?: boolean;
  "attribute-map"?: Record<string, string>;
  "group-sync"?: {
    enabled?: boolean;
    "group-attribute"?: string;
    "group-mappings"?: Record<string, number[]>;
  };
}

export const customOidcApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCustomOidcProviders: builder.query<CustomOidcConfig[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/sso/oidc",
      }),
      providesTags: ["session-properties"],
    }),
    getCustomOidcProvider: builder.query<CustomOidcConfig, string>({
      query: (key) => ({
        method: "GET",
        url: `/api/ee/sso/oidc/${key}`,
      }),
      providesTags: ["session-properties"],
    }),
    createCustomOidc: builder.mutation<CustomOidcConfig, CustomOidcConfig>({
      query: (provider) => ({
        method: "POST",
        url: "/api/ee/sso/oidc",
        body: provider,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    updateCustomOidc: builder.mutation<
      CustomOidcConfig,
      { key: string; provider: Partial<CustomOidcConfig> }
    >({
      query: ({ key, provider }) => ({
        method: "PUT",
        url: `/api/ee/sso/oidc/${key}`,
        body: provider,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteCustomOidc: builder.mutation<void, string>({
      query: (key) => ({
        method: "DELETE",
        url: `/api/ee/sso/oidc/${key}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    checkOidcConnection: builder.mutation<OidcCheckResponse, OidcCheckRequest>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/sso/oidc/check",
        body,
      }),
    }),
  }),
});

export const {
  useGetCustomOidcProvidersQuery,
  useGetCustomOidcProviderQuery,
  useCreateCustomOidcMutation,
  useUpdateCustomOidcMutation,
  useDeleteCustomOidcMutation,
  useCheckOidcConnectionMutation,
} = customOidcApi;
