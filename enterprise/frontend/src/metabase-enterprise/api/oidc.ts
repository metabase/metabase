import { invalidateTags, tag } from "metabase/api/tags";

import { EnterpriseApi } from "./api";

export interface OidcProviderConfig {
  name: string;
  "display-name": string;
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
  "icon-url"?: string | null;
  "button-color"?: string | null;
  "display-order"?: number;
}

export const oidcApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getOidcProviders: builder.query<OidcProviderConfig[], void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/sso/oidc-providers",
      }),
      providesTags: ["session-properties"],
    }),
    getOidcProvider: builder.query<OidcProviderConfig, string>({
      query: (slug) => ({
        method: "GET",
        url: `/api/ee/sso/oidc-providers/${slug}`,
      }),
      providesTags: ["session-properties"],
    }),
    createOidcProvider: builder.mutation<
      OidcProviderConfig,
      OidcProviderConfig
    >({
      query: (provider) => ({
        method: "POST",
        url: "/api/ee/sso/oidc-providers",
        body: provider,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    updateOidcProvider: builder.mutation<
      OidcProviderConfig,
      { slug: string; provider: Partial<OidcProviderConfig> }
    >({
      query: ({ slug, provider }) => ({
        method: "PUT",
        url: `/api/ee/sso/oidc-providers/${slug}`,
        body: provider,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteOidcProvider: builder.mutation<void, string>({
      query: (slug) => ({
        method: "DELETE",
        url: `/api/ee/sso/oidc-providers/${slug}`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useGetOidcProvidersQuery,
  useGetOidcProviderQuery,
  useCreateOidcProviderMutation,
  useUpdateOidcProviderMutation,
  useDeleteOidcProviderMutation,
} = oidcApi;
