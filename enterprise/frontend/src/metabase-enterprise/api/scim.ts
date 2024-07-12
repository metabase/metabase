import type {
  MaskedScimApiKey,
  UnmaskedScimApiKey,
} from "metabase-enterprise/user_provisioning/types";

import { EnterpriseApi } from "./api";

export const scimApi = EnterpriseApi.injectEndpoints({
  endpoints: builder => ({
    getScimToken: builder.query<MaskedScimApiKey, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/scim/api_key",
      }),
      providesTags: ["scim"],
    }),
    regenerateScimToken: builder.mutation<UnmaskedScimApiKey, void>({
      query: () => ({
        method: "POST",
        url: "/api/ee/scim/api_key",
      }),
      invalidatesTags: (_, error) => (!error ? ["scim"] : []),
    }),
  }),
});

export const {
  useGetScimTokenQuery,
  useRegenerateScimTokenMutation,
  endpoints: { getScimToken, regenerateScimToken },
} = scimApi;
