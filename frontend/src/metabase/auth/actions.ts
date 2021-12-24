import { getIn } from "icepick";
import { SessionApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";

export const VALIDATE_PASSWORD_RESET_TOKEN =
  "metabase/auth/VALIDATE_PASSWORD_TOKEN";
export const validatePasswordResetToken = createThunkAction(
  VALIDATE_PASSWORD_RESET_TOKEN,
  (token: string) => async () => {
    const result = await SessionApi.password_reset_token_valid({ token });
    const valid = getIn(result, ["valid"]);

    if (!valid) {
      throw result;
    }
  },
);

export const RESET_PASSWORD = "metabase/auth/RESET_PASSWORD";
export const resetPassword = createThunkAction(
  RESET_PASSWORD,
  (token: string, password: string) => async () => {
    await SessionApi.reset_password({ token, password });
  },
);
