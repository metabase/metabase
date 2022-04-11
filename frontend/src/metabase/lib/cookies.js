import Cookies from "js-cookie";

// METABASE_SESSION_COOKIE is only used for e2e tests. In normal usage cookie is set automatically by login endpoints
export const METABASE_SESSION_COOKIE = "metabase.SESSION";
export const METABASE_SEEN_ALERT_SPLASH_COOKIE = "metabase.SEEN_ALERT_SPLASH";

// Handles management of Metabase cookie work
const MetabaseCookies = {
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
