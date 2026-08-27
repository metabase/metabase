import type {
  LoginData,
  MfaMethod,
  PasswordResetTokenStatus,
} from "metabase-types/api";

import { Api } from "./api";

export interface SessionResponse {
  id: string;
}

export interface MfaChallengeResponse {
  mfa_required: true;
  methods: MfaMethod[];
  challenge_token: string;
}

export type CreateSessionResponse = SessionResponse | MfaChallengeResponse;

export const isMfaChallenge = (
  response: CreateSessionResponse,
): response is MfaChallengeResponse =>
  "mfa_required" in response && response.mfa_required === true;

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
} = sessionApi;
