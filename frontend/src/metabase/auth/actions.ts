import { getIn } from "icepick";
import { push } from "react-router-redux";

import { deleteSession, initiateSLO } from "metabase/lib/auth";
import { reload, isSmallScreen } from "metabase/lib/dom";
import { loadLocalization } from "metabase/lib/i18n";
import { createAsyncThunk } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import { openNavbar } from "metabase/redux/app";
import { refreshSiteSettings } from "metabase/redux/settings";
import { clearCurrentUser, refreshCurrentUser } from "metabase/redux/user";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import { SessionApi, UtilApi } from "metabase/services";

import {
  trackLogin,
  trackLoginGoogle,
  trackLogout,
  trackPasswordReset,
} from "./analytics";
import type { LoginData } from "./types";

export const REFRESH_LOCALE = "metabase/user/REFRESH_LOCALE";
export const refreshLocale = createAsyncThunk(
  REFRESH_LOCALE,
  async (_, { getState }) => {
    const userLocale = getUser(getState())?.locale;
    const siteLocale = getSetting(getState(), "site-locale");
    await loadLocalization(userLocale ?? siteLocale ?? "en");
  },
);

export const REFRESH_SESSION = "metabase/auth/REFRESH_SESSION";
export const refreshSession = createAsyncThunk(
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
export const login = createAsyncThunk(
  LOGIN,
  async (
    { data, redirectUrl = "/" }: LoginPayload,
    { dispatch, rejectWithValue },
  ) => {
    try {
      await SessionApi.create(data);
      await dispatch(refreshSession()).unwrap();
      trackLogin();
      dispatch(push(redirectUrl));
      if (!isSmallScreen()) {
        dispatch(openNavbar());
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

interface LoginGooglePayload {
  credential: string;
  redirectUrl?: string;
}

export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createAsyncThunk(
  LOGIN_GOOGLE,
  async (
    { credential, redirectUrl = "/" }: LoginGooglePayload,
    { dispatch, rejectWithValue },
  ) => {
    try {
      await SessionApi.createWithGoogleAuth({ token: credential });
      await dispatch(refreshSession()).unwrap();
      trackLoginGoogle();
      dispatch(push(redirectUrl));
      if (!isSmallScreen()) {
        dispatch(openNavbar());
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createAsyncThunk(
  LOGOUT,
  async (
    redirectUrl: string | undefined,
    { dispatch, rejectWithValue, getState },
  ) => {
    try {
      const state = getState();
      const user = getUser(state);

      if (user?.sso_source === "saml") {
        const { "saml-logout-url": samlLogoutUrl } = await initiateSLO();

        dispatch(clearCurrentUser());
        await dispatch(refreshLocale()).unwrap();
        trackLogout();

        if (samlLogoutUrl) {
          window.location.href = samlLogoutUrl;
        }
      } else {
        await deleteSession();
        dispatch(clearCurrentUser());
        await dispatch(refreshLocale()).unwrap();
        trackLogout();
        dispatch(push(Urls.login()));
        reload(); // clears redux state and browser caches
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

export const FORGOT_PASSWORD = "metabase/auth/FORGOT_PASSWORD";
export const forgotPassword = createAsyncThunk(
  FORGOT_PASSWORD,
  async (email: string, { rejectWithValue }) => {
    try {
      await SessionApi.forgot_password({ email });
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

interface ResetPasswordPayload {
  token: string;
  password: string;
}

export const RESET_PASSWORD = "metabase/auth/RESET_PASSWORD";
export const resetPassword = createAsyncThunk(
  RESET_PASSWORD,
  async (
    { token, password }: ResetPasswordPayload,
    { dispatch, rejectWithValue },
  ) => {
    try {
      await SessionApi.reset_password({ token, password });
      await dispatch(refreshSession()).unwrap();
      trackPasswordReset();
    } catch (error) {
      return rejectWithValue(error);
    }
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

export const validatePasswordToken = async (token: string) => {
  const result = await SessionApi.password_reset_token_valid({ token });
  const valid = getIn(result, ["valid"]);

  if (!valid) {
    throw result;
  }
};
