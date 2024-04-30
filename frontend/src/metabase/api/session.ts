import type { PasswordResetTokenStatus } from "metabase-types/api";

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
  }),
});

export const { useGetPasswordResetTokenStatusQuery, useForgotPasswordQuery } =
  sessionApi;
