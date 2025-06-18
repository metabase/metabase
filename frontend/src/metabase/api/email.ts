import type {
  CloudEmailSMTPSettings,
  EmailSMTPSettings,
} from "metabase-types/api";

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
        url: `/api/email`,
        body: emailSettings,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    updateCloudEmailSMTPSettings: builder.mutation<
      void,
      CloudEmailSMTPSettings
    >({
      query: (cloudEmailSettings) => ({
        method: "PUT",
        url: `/api/email/cloud`,
        body: cloudEmailSettings,
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
    deleteCloudEmailSMTPSettings: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: `/api/email/cloud`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useDeleteCloudEmailSMTPSettingsMutation,
  useDeleteEmailSMTPSettingsMutation,
  useSendTestEmailMutation,
  useUpdateCloudEmailSMTPSettingsMutation,
  useUpdateEmailSMTPSettingsMutation,
} = settingsApi;
