import Cookies from "js-cookie";
import { logout } from "metabase/auth/actions";
import { isSameOrigin } from "metabase/lib/dom";

export const SESSION_KEY = "metabase.TIMEOUT";
export const COOKIE_POOLING_TIMEOUT = 3000;
const getIsLoggedIn = () => typeof Cookies.get(SESSION_KEY) !== "undefined";

export const createSessionMiddleware = (
  resetActions = [],
  setInterval = global.setInterval,
) => {
  let intervalId;

  const sessionMiddlware = store => next => action => {
    if (intervalId == null || resetActions.includes(action.type)) {
      clearInterval(intervalId);

      let wasLoggedIn = getIsLoggedIn();

      intervalId = setInterval(() => {
        const isLoggedIn = getIsLoggedIn();

        if (isLoggedIn !== wasLoggedIn) {
          wasLoggedIn = isLoggedIn;

          if (isLoggedIn) {
            const params = new URLSearchParams(window.location.search);
            const redirectUrlParam = params.get("redirect");
            const redirectUrl =
              redirectUrlParam && isSameOrigin(redirectUrlParam)
                ? redirectUrlParam
                : "/";
            window.location.replace(redirectUrl);
          } else {
            const url = location.pathname + location.search + location.hash;
            store.dispatch(logout(url, true));
          }
        }
      }, COOKIE_POOLING_TIMEOUT);
    }

    next(action);
  };

  return sessionMiddlware;
};
