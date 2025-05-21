import type { EmailSMTPSettings } from "metabase-types/api";

import { Api } from "./api";
import { invalidateTags, tag } from "./tags";

export const settingsApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    sendTestEmail: builder.mutation<void, void>({
      query: () => ({
        method: "POST",
        url: `/api/email/test`,
      }),
    }),
    updateEmailSMTPSettings: builder.mutation<void, EmailSMTPSettings>({
      query: (emailSettings) => ({
        method: "PUT",
        url: `/api/setting`,
        body: emailSettings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteEmailSMTPSettings: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: `/api/email`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useDeleteEmailSMTPSettingsMutation,
  useSendTestEmailMutation,
  useUpdateEmailSMTPSettingsMutation,
} = settingsApi;
