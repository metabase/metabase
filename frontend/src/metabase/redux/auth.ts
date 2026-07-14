import {
  type ThunkDispatch,
  createAction,
  createReducer,
} from "@reduxjs/toolkit";

import { refetchSiteSettings } from "metabase/api";
import { loadLocalization } from "metabase/api/localization";
import {
  type MfaChallengeResponse,
  isMfaChallenge,
  sessionApi,
} from "metabase/api/session";
import { openNavbar } from "metabase/redux/app";
import { clearCurrentUser, refreshCurrentUser } from "metabase/redux/user";
import { createAsyncThunk } from "metabase/redux/utils";
import { push } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
import { getUser } from "metabase/selectors/user";
import * as Urls from "metabase/urls";
import { isSmallScreen, reload } from "metabase/utils/dom";
import { isResourceNotFoundError } from "metabase/utils/errors";

export interface LoginData {
  username: string;
  password: string;
  remember?: boolean;
}

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
      dispatch(refetchSiteSettings()),
    ]);
    await dispatch(refreshLocale()).unwrap();
  },
);

export const COMPLETE_LOGIN = "metabase/auth/COMPLETE_LOGIN";
export const completeLogin = createAsyncThunk(
  COMPLETE_LOGIN,
  async (_, { dispatch }) => {
    await dispatch(refreshSession()).unwrap();
    if (!isSmallScreen()) {
      dispatch(openNavbar());
    }
  },
);

interface LoginPayload {
  data: LoginData;
  redirectUrl?: string;
}

export interface LoginResult {
  mfaChallenge?: MfaChallengeResponse;
}

export const LOGIN = "metabase/auth/LOGIN";
export const login = createAsyncThunk(
  LOGIN,
  async ({ data }: LoginPayload, { dispatch, rejectWithValue }) => {
    try {
      const result = await dispatch(
        sessionApi.endpoints.createSession.initiate(data),
      ).unwrap();

      if (isMfaChallenge(result)) {
        const challenge: LoginResult = { mfaChallenge: result };
        return challenge;
      }

      await dispatch(completeLogin()).unwrap();
      const success: LoginResult = {};
      return success;
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
      await dispatch(
        sessionApi.endpoints.createSessionWithGoogleAuth.initiate({
          token: credential,
          remember,
        }),
      ).unwrap();
      await dispatch(completeLogin()).unwrap();
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
        const { "saml-logout-url": samlLogoutUrl } =
          (await initiateSLO(dispatch)) ?? {};

        dispatch(clearCurrentUser());
        await dispatch(refreshLocale()).unwrap();

        if (samlLogoutUrl) {
          window.location.href = samlLogoutUrl;
        }
      } else {
        await deleteSession(dispatch);
        dispatch(clearCurrentUser());
        await dispatch(refreshLocale()).unwrap();

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
  async (email: string, { dispatch, rejectWithValue }) => {
    try {
      await dispatch(
        sessionApi.endpoints.forgotPassword.initiate(email),
      ).unwrap();
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
    { dispatch, getState, rejectWithValue },
  ) => {
    try {
      await dispatch(
        sessionApi.endpoints.resetPassword.initiate({ token, password }),
      ).unwrap();
      await dispatch(refreshSession()).unwrap();
      return { sessionCreated: getUser(getState()) != null };
    } catch (error) {
      return rejectWithValue(error);
    }
  },
);

const initiateSLO = async (dispatch: ThunkDispatch<any, any, any>) => {
  try {
    return await dispatch(sessionApi.endpoints.logoutSso.initiate()).unwrap();
  } catch (error) {
    if (!isResourceNotFoundError(error)) {
      console.error("Problem clearing session", error);
    }
  }
};

const deleteSession = async (dispatch: ThunkDispatch<any, any, any>) => {
  try {
    await dispatch(sessionApi.endpoints.deleteSession.initiate()).unwrap();
  } catch (error) {
    if (!isResourceNotFoundError(error)) {
      console.error("Problem clearing session", error);
    }
  }
};

const initialState = {
  loginPending: false,
  redirect: true,
};

export const reducer = createReducer(initialState, (builder) => {
  builder.addCase(login.pending, (state) => {
    state.loginPending = true;
  });
  builder.addCase(login.fulfilled, (state) => {
    state.loginPending = false;
  });

  builder.addCase(loginGoogle.pending, (state) => {
    state.loginPending = true;
  });
  builder.addCase(loginGoogle.fulfilled, (state) => {
    state.loginPending = false;
  });

  builder.addCase(completeLogin.pending, (state) => {
    state.loginPending = true;
  });
  builder.addCase(completeLogin.fulfilled, (state) => {
    state.loginPending = false;
  });
  builder.addCase(completeLogin.rejected, (state) => {
    state.loginPending = false;
  });
  builder.addCase(pauseRedirect.toString(), (state) => {
    state.redirect = false;
  });
});
