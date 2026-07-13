import type { LoginData } from "metabase/redux/auth";
import { loadSettings } from "metabase/redux/settings";
import {
  isValidColorScheme,
  setUserColorSchemeAfterUpdate,
} from "metabase/utils/color-scheme";
import MetabaseSettings from "metabase/utils/settings";
import type {
  EnterpriseSettings,
  PasswordResetTokenStatus,
} from "metabase-types/api";

import { Api } from "./api";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const sessionPropertiesPath = "/api/session/properties";

export interface SessionResponse {
  id: string;
}

export interface MfaChallengeResponse {
  mfa_required: true;
  method: string;
  enroll_required: boolean;
  mfa_token: string;
}

export type CreateSessionResponse = SessionResponse | MfaChallengeResponse;

export const isMfaChallenge = (
  response: CreateSessionResponse,
): response is MfaChallengeResponse => "mfa_required" in response;

export interface MfaStatus {
  enabled: boolean;
  required: boolean;
  enrolled: boolean;
  method: string | null;
}

export interface MfaEnrollResponse {
  secret: string;
  otpauth_uri: string;
}

export interface GoogleAuthData {
  token: string;
  remember?: boolean;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export interface SsoLogoutResponse {
  "saml-logout-url"?: string;
}

export const sessionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
    createSession: builder.mutation<CreateSessionResponse, LoginData>({
      query: (body) => ({
        method: "POST",
        url: "/api/session",
        body,
      }),
    }),
    verifyMfa: builder.mutation<
      SessionResponse,
      { mfa_token: string; code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa",
        body,
      }),
    }),
    getMfaStatus: builder.query<MfaStatus, void>({
      query: () => ({
        method: "GET",
        url: "/api/session/mfa",
      }),
      providesTags: ["session-properties"],
    }),
    enrollMfa: builder.mutation<MfaEnrollResponse, { password: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/enroll",
        body,
      }),
    }),
    confirmMfaEnrollment: builder.mutation<
      { success: boolean },
      { code: string }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/enroll/confirm",
        body,
      }),
      invalidatesTags: ["session-properties"],
    }),
    disableMfa: builder.mutation<void, { password: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/disable",
        body,
      }),
      invalidatesTags: ["session-properties"],
    }),
    updateMfaAdminSettings: builder.mutation<
      void,
      { enabled?: boolean; required?: boolean }
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/mfa/admin-settings",
        body,
      }),
      invalidatesTags: ["session-properties"],
    }),
    createSessionWithGoogleAuth: builder.mutation<
      SessionResponse,
      GoogleAuthData
    >({
      query: (body) => ({
        method: "POST",
        url: "/api/session/google_auth",
        body,
      }),
    }),
    deleteSession: builder.mutation<void, void>({
      query: () => ({
        method: "DELETE",
        url: "/api/session",
      }),
    }),
    logoutSso: builder.mutation<SsoLogoutResponse, void>({
      query: () => ({
        method: "POST",
        url: "/auth/sso/logout",
      }),
    }),
    resetPassword: builder.mutation<void, ResetPasswordData>({
      query: (body) => ({
        method: "POST",
        url: "/api/session/reset_password",
        body,
      }),
    }),
    getPasswordResetTokenStatus: builder.query<
      PasswordResetTokenStatus,
      string
    >({
      query: (token) => ({
        method: "GET",
        url: "/api/session/password_reset_token_valid",
        body: { token },
      }),
    }),
    forgotPassword: builder.mutation<void, string>({
      query: (email) => ({
        method: "POST",
        url: "/api/session/forgot_password",
        body: { email },
      }),
    }),
    checkPassword: builder.mutation<void, { password: string }>({
      query: (body) => ({
        method: "POST",
        url: "/api/session/password-check",
        body,
      }),
    }),
    getSessionProperties: builder.query<EnterpriseSettings, void>({
      query: () => ({
        method: "GET",
        url: sessionPropertiesPath,
      }),
      providesTags: ["session-properties"],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) => {
          dispatch(loadSettings(data));
          // compatibility layer for legacy settings on the window object
          MetabaseSettings.setAll(data);

          // Sync color-scheme setting to window.MetabaseUserColorScheme
          if (
            data["color-scheme"] &&
            isValidColorScheme(data["color-scheme"])
          ) {
            setUserColorSchemeAfterUpdate(data["color-scheme"]);
          }
        }),
    }),
  }),
});

export const {
  useCreateSessionMutation,
  useCreateSessionWithGoogleAuthMutation,
  useDeleteSessionMutation,
  useLogoutSsoMutation,
  useResetPasswordMutation,
  useGetPasswordResetTokenStatusQuery,
  useForgotPasswordMutation,
  useCheckPasswordMutation,
  useGetSessionPropertiesQuery,
  useVerifyMfaMutation,
  useGetMfaStatusQuery,
  useEnrollMfaMutation,
  useConfirmMfaEnrollmentMutation,
  useDisableMfaMutation,
  useUpdateMfaAdminSettingsMutation,
} = sessionApi;

// alias for easier use
export const useGetSettingsQuery = useGetSessionPropertiesQuery;
