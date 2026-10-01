import { Api } from "metabase/api";
import {
  invalidateTags,
  provideSubscriptionChannelListTags,
  tag,
} from "metabase/api/tags";
import type { EmailSMTPSettings } from "metabase-types/api";

export const emailApi = Api.injectEndpoints({
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
        invalidateTags(error, [
          tag("session-properties"),
          ...provideSubscriptionChannelListTags(),
        ]),
    }),
    deleteEmailSMTPSettings: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: `/api/email`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [
          tag("session-properties"),
          ...provideSubscriptionChannelListTags(),
        ]),
    }),
  }),
});

export const {
  useDeleteEmailSMTPSettingsMutation,
  useSendTestEmailMutation,
  useUpdateEmailSMTPSettingsMutation,
} = emailApi;
