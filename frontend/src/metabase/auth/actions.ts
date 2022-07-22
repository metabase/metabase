import { push } from "react-router-redux";
import { getIn } from "icepick";
import { SessionApi, UtilApi } from "metabase/services";
import MetabaseSettings from "metabase/lib/settings";
import { createThunkAction } from "metabase/lib/redux";
import { loadLocalization } from "metabase/lib/i18n";
import { deleteSession } from "metabase/lib/auth";
import { clearCurrentUser, refreshCurrentUser } from "metabase/redux/user";
import { refreshSiteSettings } from "metabase/redux/settings";
import { getUser } from "metabase/selectors/user";
import { State } from "metabase-types/store";
import {
  trackLogin,
  trackLoginGoogle,
  trackLogout,
  trackPasswordReset,
} from "./analytics";
import { LoginData } from "./types";

export const REFRESH_LOCALE = "metabase/user/REFRESH_LOCALE";
export const refreshLocale = createThunkAction(
  REFRESH_LOCALE,
  () => async (dispatch: any, getState: () => State) => {
    const userLocale = getUser(getState())?.locale;
    const siteLocale = MetabaseSettings.get("site-locale");
    await loadLocalization(userLocale ?? siteLocale ?? "en");
  },
);

export const REFRESH_SESSION = "metabase/auth/REFRESH_SESSION";
export const refreshSession = createThunkAction(
  REFRESH_SESSION,
  () => async (dispatch: any) => {
    await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);
    await dispatch(refreshLocale());
  },
);

export const LOGIN = "metabase/auth/LOGIN";
export const login = createThunkAction(
  LOGIN,
  (data: LoginData, redirectUrl = "/") =>
    async (dispatch: any) => {
      await SessionApi.create(data);
      await dispatch(refreshSession());
      trackLogin();

      dispatch(push(redirectUrl));
    },
);

export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createThunkAction(
  LOGIN_GOOGLE,
  (token: string, redirectUrl = "/") =>
    async (dispatch: any) => {
      await SessionApi.createWithGoogleAuth({ token });
      await dispatch(refreshSession());
      trackLoginGoogle();

      dispatch(push(redirectUrl));
    },
);

export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createThunkAction(
  LOGOUT,
  (redirectUrl: string, isSessionAlreadyExpired: boolean) => {
    return async (dispatch: any) => {
      if (!isSessionAlreadyExpired) {
        await deleteSession();
      }
      await dispatch(clearCurrentUser());
      await dispatch(refreshLocale());
      trackLogout();

      let loginUrl = "/auth/login";
      if (redirectUrl) {
        loginUrl += `?redirect=${encodeURIComponent(redirectUrl)}`;
      }

      dispatch(push(loginUrl));
      window.location.reload(); // clears redux state and browser caches
    };
  },
);

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
    await dispatch(refreshSession());
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
