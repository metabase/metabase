import Cookies from "js-cookie";

const SESSION_KEY = "metabase.TIMEOUT";
const COOKIE_POOLING_TIMEOUT = 5000;
const getIsLoggedIn = () => typeof Cookies.get(SESSION_KEY) !== "undefined";
let wasLoggedIn = getIsLoggedIn();

const LAST_URL_KEY = "lastSessionUrl";

export const clearLastSessionUrl = () =>
  window.sessionStorage.removeItem(LAST_URL_KEY);

export const getLastSessionUrl = () =>
  window.sessionStorage.getItem(LAST_URL_KEY) ?? "/";

export const subscribeToSessionChanges = (
  onSessionAppeared: (lastUrl: string | null) => void,
  onSessionExpired: () => void,
) => {
  setInterval(() => {
    const isLoggedIn = getIsLoggedIn();

    if (isLoggedIn !== wasLoggedIn) {
      wasLoggedIn = isLoggedIn;

      if (isLoggedIn) {
        onSessionAppeared(getLastSessionUrl());
      } else {
        window.localStorage.setItem(LAST_URL_KEY, window.location.toString());
        onSessionExpired();
      }
    }
  }, COOKIE_POOLING_TIMEOUT);
};
