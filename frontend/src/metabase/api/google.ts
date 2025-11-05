import type { EnterpriseSettings } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

type GoogleAuthSettings = Pick<
  EnterpriseSettings,
  | "google-auth-enabled"
  | "google-auth-client-id"
  | "google-auth-auto-create-accounts-domain"
>;

export const googleApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    updateGoogleAuth: builder.mutation<void, GoogleAuthSettings>({
      query: (settings) => ({
        method: "PUT",
        url: `/api/google/settings`,
        body: settings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const { useUpdateGoogleAuthMutation } = googleApi;
