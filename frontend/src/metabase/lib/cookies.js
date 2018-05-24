import { clearGoogleAuthCredentials } from "metabase/lib/auth";

import Cookies from "js-cookie";

export const METABASE_SESSION_COOKIE = "metabase.SESSION_ID";
export const METABASE_SEEN_ALERT_SPLASH_COOKIE = "metabase.SEEN_ALERT_SPLASH";

// Handles management of Metabase cookie work
let MetabaseCookies = {
  // set the session cookie.  if sessionId is null, clears the cookie
  setSessionCookie: function(sessionId) {
    const options = {
      path: window.MetabaseRoot || "/",
      expires: 14,
      secure: window.location.protocol === "https:",
    };

    try {
      if (sessionId) {
        // set a session cookie
        Cookies.set(METABASE_SESSION_COOKIE, sessionId, options);
      } else {
        sessionId = Cookies.get(METABASE_SESSION_COOKIE);

        // delete the current session cookie and Google Auth creds
        Cookies.remove(METABASE_SESSION_COOKIE);
        clearGoogleAuthCredentials();

        return sessionId;
      }
    } catch (e) {
      console.error("setSessionCookie:", e);
    }
  },

  setHasSeenAlertSplash: hasSeen => {
    const options = {
      path: window.MetabaseRoot || "/",
      expires: 365,
      secure: window.location.protocol === "https:",
    };

    try {
      Cookies.set(METABASE_SEEN_ALERT_SPLASH_COOKIE, hasSeen, options);
    } catch (e) {
      console.error("setSeenAlertSplash:", e);
    }
  },

  getHasSeenAlertSplash: () => {
    try {
      return Cookies.get(METABASE_SEEN_ALERT_SPLASH_COOKIE) || false;
    } catch (e) {
      console.error("getSeenAlertSplash:", e);
      return false;
    }
  },
};

export default MetabaseCookies;
