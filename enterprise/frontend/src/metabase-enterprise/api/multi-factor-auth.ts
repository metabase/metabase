import type { MfaMethod } from "metabase-types/api";

import { EnterpriseApi } from "./api";

export interface MfaStatus {
  mfa_enabled: boolean;
  enrolled: boolean;
  pending: boolean;
  method: MfaMethod | null;
  recovery_codes_remaining: number;
}

export interface MfaEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export interface MfaAdminOverview {
  encryption_key_set: boolean;
  enrolled_count: number;
  unenrolled_count: number;
}

export const multiFactorAuthApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMfaAdminOverview: builder.query<MfaAdminOverview, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/admin/overview",
      }),
      providesTags: ["mfa-status"],
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
      providesTags: ["mfa-status"],
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
      invalidatesTags: ["mfa-status"],
    }),
    disableMfa: builder.mutation<void, { code: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/disable",
        body,
      }),
      invalidatesTags: ["mfa-status"],
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
      invalidatesTags: ["mfa-status"],
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
