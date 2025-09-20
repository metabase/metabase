import MetabaseSettings from "metabase/lib/settings";
import { loadSettings } from "metabase/redux/settings";
import type {
  EnterpriseSettings,
  PasswordResetTokenStatus,
} from "metabase-types/api";

import { Api } from "./api";
import { handleQueryFulfilled } from "./utils/lifecycle";

export const sessionApi = Api.injectEndpoints({
  endpoints: (builder) => ({
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
    getSessionProperties: builder.query<EnterpriseSettings, void>({
      query: () => ({
        method: "GET",
        url: "/api/session/properties",
      }),
      providesTags: ["session-properties"],
      onQueryStarted: (_, { queryFulfilled, dispatch }) =>
        handleQueryFulfilled(queryFulfilled, (data) => {
          dispatch(loadSettings(data));
          // compatibility layer for legacy settings on the window object
          MetabaseSettings.setAll(data);
        }),
    }),
  }),
});

export const {
  useGetPasswordResetTokenStatusQuery,
  useForgotPasswordMutation,
  useGetSessionPropertiesQuery,
} = sessionApi;

// alias for easier use
export const useGetSettingsQuery = useGetSessionPropertiesQuery;
