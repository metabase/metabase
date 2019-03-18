import {
  handleActions,
  combineReducers,
  createThunkAction,
} from "metabase/lib/redux";

import { push } from "react-router-redux";

import MetabaseCookies from "metabase/lib/cookies";
import MetabaseUtils from "metabase/lib/utils";
import MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";
import { t } from "c-3po";
import { clearGoogleAuthCredentials } from "metabase/lib/auth";

import { refreshCurrentUser } from "metabase/redux/user";

import { SessionApi } from "metabase/services";

// login
export const LOGIN = "metabase/auth/LOGIN";
export const login = createThunkAction(LOGIN, function(
  credentials,
  redirectUrl,
) {
  return async function(dispatch, getState) {
    if (
      !MetabaseSettings.ldapEnabled() &&
      !MetabaseUtils.validEmail(credentials.username)
    ) {
      return {
        data: {
          errors: { email: t`Please enter a valid formatted email address.` },
        },
      };
    }

    try {
      let newSession = await SessionApi.create(credentials);

      // since we succeeded, lets set the session cookie
      MetabaseCookies.setSessionCookie(newSession.id);

      MetabaseAnalytics.trackEvent("Auth", "Login");
      // TODO: redirect after login (carry user to intended destination)
      await dispatch(refreshCurrentUser());
      dispatch(push(redirectUrl || "/"));
    } catch (error) {
      return error;
    }
  };
});

// login Google
export const LOGIN_GOOGLE = "metabase/auth/LOGIN_GOOGLE";
export const loginGoogle = createThunkAction(LOGIN_GOOGLE, function(
  googleUser,
  redirectUrl,
) {
  return async function(dispatch, getState) {
    try {
      let newSession = await SessionApi.createWithGoogleAuth({
        token: googleUser.getAuthResponse().id_token,
      });

      // since we succeeded, lets set the session cookie
      MetabaseCookies.setSessionCookie(newSession.id);

      MetabaseAnalytics.trackEvent("Auth", "Google Auth Login");

      // TODO: redirect after login (carry user to intended destination)
      await dispatch(refreshCurrentUser());
      dispatch(push(redirectUrl || "/"));
    } catch (error) {
      clearGoogleAuthCredentials();
      // If we see a 428 ("Precondition Required") that means we need to show the "No Metabase account exists for this Google Account" page
      if (error.status === 428) {
        dispatch(push("/auth/google_no_mb_account"));
      } else {
        return error;
      }
    }
  };
});

// logout
export const LOGOUT = "metabase/auth/LOGOUT";
export const logout = createThunkAction(LOGOUT, function() {
  return function(dispatch, getState) {
    // TODO: as part of a logout we want to clear out any saved state that we have about anything

    let sessionId = MetabaseCookies.setSessionCookie();
    if (sessionId) {
      // actively delete the session
      SessionApi.delete({ session_id: sessionId });
    }
    MetabaseAnalytics.trackEvent("Auth", "Logout");

    dispatch(push("/auth/login"));

    // refresh to ensure all application state is cleared
    window.location.reload();
  };
});

// passwordReset
export const PASSWORD_RESET = "metabase/auth/PASSWORD_RESET";
export const passwordReset = createThunkAction(PASSWORD_RESET, function(
  token,
  credentials,
) {
  return async function(dispatch, getState) {
    if (credentials.password !== credentials.password2) {
      return {
        success: false,
        error: { data: { errors: { password2: t`Passwords do not match` } } },
      };
    }

    try {
      let result = await SessionApi.reset_password({
        token: token,
        password: credentials.password,
      });

      if (result.session_id) {
        // we should have a valid session that we can use immediately!
        MetabaseCookies.setSessionCookie(result.session_id);
      }

      MetabaseAnalytics.trackEvent("Auth", "Password Reset");

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  };
});

// reducers

const loginError = handleActions(
  {
    [LOGIN]: { next: (state, { payload }) => (payload ? payload : null) },
    [LOGIN_GOOGLE]: {
      next: (state, { payload }) => (payload ? payload : null),
    },
  },
  null,
);

const resetSuccess = handleActions(
  {
    [PASSWORD_RESET]: { next: (state, { payload }) => payload.success },
  },
  false,
);

const resetError = handleActions(
  {
    [PASSWORD_RESET]: { next: (state, { payload }) => payload.error },
  },
  null,
);

export default combineReducers({
  loginError,
  resetError,
  resetSuccess,
});
