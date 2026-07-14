import type { LoginData } from "metabase/redux/auth";
import {
  isValidColorScheme,
  setUserColorSchemeAfterUpdate,
} from "metabase/utils/color-scheme";
import MetabaseSettings from "metabase/utils/settings";
import type {
  EnterpriseSettings,
  MfaMethod,
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
    getSessionProperties: builder.query<EnterpriseSettings, void>({
      query: () => ({
        method: "GET",
        url: sessionPropertiesPath,
      }),
      providesTags: ["session-properties"],
      // Never evict the single (no-arg) settings entry, mirroring the redux
      // slice this replaced: it keeps `getSettings` on the live cache instead of
      // the stale page-load bootstrap, and keeps optimistic patches targetable
      // between subscriptions. Only disables GC, not refresh — invalidation and
      // `refetchSiteSettings()` still refetch.
      keepUnusedDataFor: Infinity,
      onQueryStarted: (_, { queryFulfilled }) =>
        handleQueryFulfilled(queryFulfilled, (data) => {
          // Keep the non-redux settings consumers in sync. `MetabaseSettings`
          // is read by code that runs outside the store/React (i18n, dom
          // helpers, theming).
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
  useLazyGetSessionPropertiesQuery,
} = sessionApi;

// aliases for easier use
export const useGetSettingsQuery = useGetSessionPropertiesQuery;
export const useLazyGetSettingsQuery = useLazyGetSessionPropertiesQuery;

/**
 * Force a refetch of the session properties (settings) from non-React code.
 * Dispatch it: `dispatch(refetchSiteSettings())`. In React, prefer
 * `useLazyGetSettingsQuery()`'s trigger instead.
 */
export const refetchSiteSettings = () =>
  sessionApi.endpoints.getSessionProperties.initiate(undefined, {
    forceRefetch: true,
  });
