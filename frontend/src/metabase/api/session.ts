import MetabaseSettings from "metabase/lib/settings";
import { loadSettings } from "metabase/redux/settings";
import type { PasswordResetTokenStatus, Settings } from "metabase-types/api";

import { Api } from "./api";

export const sessionApi = Api.injectEndpoints({
  endpoints: builder => ({
    getPasswordResetTokenStatus: builder.query<
      PasswordResetTokenStatus,
      string
    >({
      query: token => ({
        method: "GET",
        url: "/api/session/password_reset_token_valid",
        body: { token },
      }),
    }),
    forgotPassword: builder.query<void, string>({
      query: email => ({
        method: "POST",
        url: "/api/session/forgot_password",
        body: { email },
      }),
    }),
    getSessionProperties: builder.query<Settings, void>({
      query: () => ({
        method: "GET",
        url: "/api/session/properties",
      }),
      providesTags: ["session-properties"],
      onQueryStarted: async (_, { queryFulfilled, dispatch }) => {
        const response = await queryFulfilled;
        if (response.data) {
          dispatch(loadSettings(response.data));
          // compatibility layer for legacy settings on the window object
          MetabaseSettings.setAll(response.data);
        }
      },
    }),
  }),
});

export const {
  useGetPasswordResetTokenStatusQuery,
  useForgotPasswordQuery,
  useGetSessionPropertiesQuery,
} = sessionApi;

// alias for easier use
export const useGetSettingsQuery = useGetSessionPropertiesQuery;
