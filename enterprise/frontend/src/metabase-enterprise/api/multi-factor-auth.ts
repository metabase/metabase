import type {
  MfaAdminOverview,
  MfaEnrollResponse,
  MfaStatus,
} from "metabase-types/api";

import { EnterpriseApi } from "./api";
import { invalidateTags, provideMfaStatusTags, tag } from "./tags";

export const multiFactorAuthApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMfaAdminOverview: builder.query<MfaAdminOverview, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/admin/overview",
      }),
      providesTags: () => provideMfaStatusTags(),
    }),
    verifyMfa: builder.mutation<
      { id: string },
      { challenge_token: string; code: string; remember?: boolean }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/verify",
        body,
      }),
    }),
    getMfaStatus: builder.query<MfaStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/status",
      }),
      providesTags: () => provideMfaStatusTags(),
    }),
    enrollMfa: builder.mutation<MfaEnrollResponse, { password: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/enroll",
        body,
      }),
    }),
    confirmMfaEnrollment: builder.mutation<
      { recovery_codes: string[] },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/enroll/confirm",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
    disableMfa: builder.mutation<void, { code: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/disable",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
    sendEmailOtp: builder.mutation<
      { success: true },
      { challenge_token: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/send-email-otp",
        body,
      }),
    }),
    regenerateRecoveryCodes: builder.mutation<
      { recovery_codes: string[] },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/recovery-codes",
        body,
      }),
      invalidatesTags: (_, error) => invalidateTags(error, [tag("mfa-status")]),
    }),
  }),
});

export const {
  useGetMfaAdminOverviewQuery,
  useVerifyMfaMutation,
  useGetMfaStatusQuery,
  useEnrollMfaMutation,
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useSendEmailOtpMutation,
  useRegenerateRecoveryCodesMutation,
} = multiFactorAuthApi;
