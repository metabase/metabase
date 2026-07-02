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
    createSession: builder.mutation<SessionResponse, LoginData>({
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
} = sessionApi;

// alias for easier use
export const useGetSettingsQuery = useGetSessionPropertiesQuery;
