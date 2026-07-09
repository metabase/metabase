import { EnterpriseApi } from "./api";

export interface MfaStatus {
  mfa_enabled: boolean;
  enrolled: boolean;
  pending: boolean;
  method: string | null;
  recovery_codes_remaining: number;
}

export interface MfaEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export const multiFactorAuthApi = EnterpriseApi.injectEndpoints({
  endpoints: (builder) => ({
    verifyMfa: builder.mutation<
      { id: string },
      { mfa_token: string; code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/verify",
        body,
      }),
    }),
    getMfaStatus: builder.query<MfaStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/ee/mfa/status",
      }),
      providesTags: ["session-properties"],
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
      invalidatesTags: ["session-properties"],
    }),
    disableMfa: builder.mutation<void, { code: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/disable",
        body,
      }),
      invalidatesTags: ["session-properties"],
    }),
    sendEmailOtp: builder.mutation<{ success: true }, { mfa_token: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/send-email-otp",
        body,
      }),
    }),
    regenerateRecoveryCodes: builder.mutation<
      { codes: string[] },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/ee/mfa/recovery-codes",
        body,
      }),
      invalidatesTags: ["session-properties"],
    }),
  }),
});

export const {
  useVerifyMfaMutation,
  useGetMfaStatusQuery,
  useEnrollMfaMutation,
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useSendEmailOtpMutation,
  useRegenerateRecoveryCodesMutation,
} = multiFactorAuthApi;
