import { type UnknownAction, createAction } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { push } from "react-router-redux";

import { deleteSession, initiateSLO } from "metabase/lib/auth";
import { isSmallScreen, reload } from "metabase/lib/dom";
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

import type { LoginData } from "./types";

export const REFRESH_LOCALE = "metabase/user/REFRESH_LOCALE";
export const refreshLocale = createAsyncThunk(
  REFRESH_LOCALE,
  async (_, { dispatch, getState }) => {
    const userLocale = getUser(getState())?.locale;
    const siteLocale = getSetting(getState(), "site-locale");
    if (userLocale && userLocale !== siteLocale) {
      // This sets a flag to keep the route guard from redirecting us while the reload is happening
      await dispatch(pauseRedirect());
      reload();
    } else {
      await loadLocalization(userLocale ?? siteLocale ?? "en");
    }
  },
);

export const PAUSE_REDIRECT = "metabase/user/PAUSE_REDIRECT";
export const pauseRedirect = createAction(PAUSE_REDIRECT);

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
  async ({ data }: LoginPayload, { dispatch, rejectWithValue }) => {
    try {
      await SessionApi.create(data);
      await dispatch(refreshSession()).unwrap();
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
  remember?: boolean;
}

export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createAsyncThunk(
  LOGIN_GOOGLE,
  async (
    { credential, remember }: LoginGooglePayload,
    { dispatch, rejectWithValue },
  ) => {
    try {
      await SessionApi.createWithGoogleAuth({
        token: credential,
        remember,
      });
      await dispatch(refreshSession()).unwrap();
      if (!isSmallScreen()) {
        dispatch(openNavbar());
      }
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

interface LoginSSOPayload {
  redirectUrl?: string;
  remember?: boolean;
}

export const LOGIN_SSO = "metabase/auth/LOGIN_SSO";
export const loginSSO = createAsyncThunk(
  LOGIN_SSO,
  async (
    { redirectUrl }: LoginSSOPayload,
    { dispatch, rejectWithValue },
  ) => {
    try {
      // Redirect to SSO login endpoint
      const response = await fetch("/api/sso/login");
      const data = await response.json();
      
      if (response.ok && data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        return rejectWithValue(new Error("Failed to initiate SSO login"));
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

        if (samlLogoutUrl) {
          window.location.href = samlLogoutUrl;
        }
      } else {
        await deleteSession();
        dispatch(clearCurrentUser());
        await dispatch(refreshLocale()).unwrap();

        // We use old react-router-redux which references old redux, which does not require
        // action type to be a string - unlike RTK v2+
        dispatch(push(Urls.login()) as unknown as UnknownAction);
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
