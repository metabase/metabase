import { push } from "react-router-redux";
import { getIn } from "icepick";
import { SessionApi, UtilApi } from "metabase/services";
import { createThunkAction } from "metabase/lib/redux";
import { clearGoogleAuthCredentials, deleteSession } from "metabase/lib/auth";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { trackLogout, trackPasswordReset } from "./analytics";

export const REFRESH = "metabase/auth/refresh";
export const refresh = createThunkAction(
  REFRESH,
  () => async (dispatch: any) => {
    await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);
  },
);

export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createThunkAction(LOGOUT, () => {
  return async (dispatch: any) => {
    await deleteSession();
    await clearGoogleAuthCredentials();
    trackLogout();

    dispatch(push("/auth/login"));
    window.location.reload();
  };
});

export const FORGOT_PASSWORD = "metabase/auth/FORGOT_PASSWORD";
export const forgotPassword = createThunkAction(
  FORGOT_PASSWORD,
  (email: string) => async () => {
    await SessionApi.forgot_password({ email });
  },
);

export const RESET_PASSWORD = "metabase/auth/RESET_PASSWORD";
export const resetPassword = createThunkAction(
  RESET_PASSWORD,
  (token: string, password: string) => async (dispatch: any) => {
    await SessionApi.reset_password({ token, password });
    await dispatch(refresh());
    trackPasswordReset();
  },
);

export const VALIDATE_PASSWORD = "metabase/auth/VALIDATE_PASSWORD";
export const validatePassword = createThunkAction(
  VALIDATE_PASSWORD,
  (password: string) => async () => {
    await UtilApi.password_check({ password });
  },
);

export const VALIDATE_PASSWORD_TOKEN = "metabase/auth/VALIDATE_TOKEN";
export const validatePasswordToken = createThunkAction(
  VALIDATE_PASSWORD_TOKEN,
  (token: string) => async () => {
    const result = await SessionApi.password_reset_token_valid({ token });
    const valid = getIn(result, ["valid"]);

    if (!valid) {
      throw result;
    }
  },
);
