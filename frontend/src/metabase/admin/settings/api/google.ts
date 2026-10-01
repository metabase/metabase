import { Api } from "metabase/api";
import { invalidateTags, tag } from "metabase/api/tags";
import type { EnterpriseSettings } from "metabase-types/api";

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
