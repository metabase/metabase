import Cookies from "js-cookie";

// METABASE_SESSION_COOKIE is only used for e2e tests. In normal usage cookie is set automatically by login endpoints
export const METABASE_SESSION_COOKIE = "metabase.SESSION";

const cookieOptions = {
  path: window.MetabaseRoot || "/",
  expires: 365, // TODO: Why does this expire after one year?
  secure: window.location.protocol === "https:",
};

export const rememberThatSplashAlertWasSeen = () => {
  Cookies.set("metabase.SEEN_ALERT_SPLASH", "true", cookieOptions);
};

export const hasSplashAlertBeenSeen = () => {
  return Cookies.get("metabase.SEEN_ALERT_SPLASH") === "true";
};

export const rememberThatModelBannerWasDismissed = () => {
  Cookies.set("metabase.MODEL_BANNER_DISMISSED", "true", {
    ...cookieOptions,
    expires: 8000,
  });
};

export const wasModelBannerDismissed = () => {
  return Cookies.get("metabase.MODEL_BANNER_DISMISSED") === "true";
};
