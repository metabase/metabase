import { invalidateTags, tag } from "metabase/api/tags";
import type { EmailSMTPOverrideSettings } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export const smtpOverrideApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    updateEmailSMTPOverrideSettings: builder.mutation<
      void,
      EmailSMTPOverrideSettings
    >({
      query: (emailSettingsOverride) => ({
        method: "PUT",
        url: `/api/ee/email/override`,
        body: emailSettingsOverride,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
    deleteEmailSMTPOverrideSettings: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: `/api/ee/email/override`,
      }),
      invalidatesTags: (_, error) =>
        invalidateTags(error, [tag("session-properties")]),
    }),
  }),
});

export const {
  useUpdateEmailSMTPOverrideSettingsMutation,
  useDeleteEmailSMTPOverrideSettingsMutation,
} = smtpOverrideApi;
