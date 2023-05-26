import { createAsyncThunk } from "@reduxjs/toolkit";
import { push } from "react-router-redux";
import { getIn } from "icepick";
import { SessionApi, UtilApi } from "metabase/services";
import { getSetting } from "metabase/selectors/settings";
import { loadLocalization } from "metabase/lib/i18n";
import { deleteSession } from "metabase/lib/auth";
import * as Urls from "metabase/lib/urls";
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

interface ThunkConfig {
  state: State;
}

export const REFRESH_LOCALE = "metabase/user/REFRESH_LOCALE";
export const refreshLocale = createAsyncThunk<void, void, ThunkConfig>(
  REFRESH_LOCALE,
  async (_, { getState }) => {
    const userLocale = getUser(getState())?.locale;
    const siteLocale = getSetting(getState(), "site-locale");
    await loadLocalization(userLocale ?? siteLocale ?? "en");
  },
);

export const REFRESH_SESSION = "metabase/auth/REFRESH_SESSION";
export const refreshSession = createAsyncThunk<void, void, ThunkConfig>(
  REFRESH_SESSION,
  async (_, { dispatch }) => {
    await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);
    await dispatch(refreshLocale()).unwrap();
  },
);

interface LoginPayload {
  data: LoginData;
  redirectUrl?: string;
}

export const LOGIN = "metabase/auth/LOGIN";
export const login = createAsyncThunk<void, LoginPayload, ThunkConfig>(
  LOGIN,
  async ({ data, redirectUrl = "/" }, { dispatch }) => {
    await SessionApi.create(data);
    await dispatch(refreshSession()).unwrap();
    trackLogin();

    dispatch(push(redirectUrl));
  },
);

interface LoginGooglePayload {
  token: string;
  redirectUrl?: string;
}

export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createAsyncThunk<
  void,
  LoginGooglePayload,
  ThunkConfig
>(LOGIN_GOOGLE, async ({ token, redirectUrl = "/" }, { dispatch }) => {
  await SessionApi.createWithGoogleAuth({ token });
  await dispatch(refreshSession()).unwrap();
  trackLoginGoogle();

  dispatch(push(redirectUrl));
});

export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createAsyncThunk(LOGOUT, (redirectUrl: string) => {
  return async (dispatch: any) => {
    await deleteSession();
    await dispatch(clearCurrentUser());
    await dispatch(refreshLocale());
    trackLogout();

    dispatch(push(Urls.login(redirectUrl)));
    window.location.reload(); // clears redux state and browser caches
  };
});

export const FORGOT_PASSWORD = "metabase/auth/FORGOT_PASSWORD";
export const forgotPassword = createAsyncThunk(
  FORGOT_PASSWORD,
  (email: string) => async () => {
    await SessionApi.forgot_password({ email });
  },
);

export const RESET_PASSWORD = "metabase/auth/RESET_PASSWORD";
export const resetPassword = createAsyncThunk(
  RESET_PASSWORD,
  (token: string, password: string) => async (dispatch: any) => {
    await SessionApi.reset_password({ token, password });
    await dispatch(refreshSession());
    trackPasswordReset();
  },
);

export const validatePassword = async (password: string) => {
  const error = MetabaseSettings.passwordComplexityDescription(password);
  if (error) {
    return error;
  }

  try {
    await UtilApi.password_check({ password });
  } catch (error) {
    return getIn(error, ["data", "errors", "password"]);
  }
};

export const VALIDATE_PASSWORD_TOKEN = "metabase/auth/VALIDATE_TOKEN";
export const validatePasswordToken = createAsyncThunk(
  VALIDATE_PASSWORD_TOKEN,
  (token: string) => async () => {
    const result = await SessionApi.password_reset_token_valid({ token });
    const valid = getIn(result, ["valid"]);

    if (!valid) {
      throw result;
    }
  },
);
