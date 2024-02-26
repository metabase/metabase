import Cookies from "js-cookie";
import { replace } from "react-router-redux";

import { logout, refreshSession } from "metabase/auth/actions";
import { isSameOrSiteUrlOrigin } from "metabase/lib/dom";

export const SESSION_KEY = "metabase.TIMEOUT";
export const COOKIE_POOLING_TIMEOUT = 3000;
const getIsLoggedIn = () => typeof Cookies.get(SESSION_KEY) !== "undefined";

const getRedirectUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const redirectUrlParam = params.get("redirect");

  return redirectUrlParam != null && isSameOrSiteUrlOrigin(redirectUrlParam)
    ? redirectUrlParam
    : null;
};

export const createSessionMiddleware = (
  resetActions = [],
  setInterval = global.setInterval,
) => {
  let intervalId;

  const sessionMiddlware = store => next => action => {
    if (intervalId == null || resetActions.includes(action.type)) {
      clearInterval(intervalId);

      let wasLoggedIn = getIsLoggedIn();

      // get the redirect url before refreshing the session because after the refresh the url will be reset
      const redirectUrl = getRedirectUrl();

      if (wasLoggedIn && !!redirectUrl) {
        store.dispatch(replace(redirectUrl));
      }

      intervalId = setInterval(async () => {
        const isLoggedIn = getIsLoggedIn();

        if (isLoggedIn !== wasLoggedIn) {
          wasLoggedIn = isLoggedIn;

          if (isLoggedIn) {
            await store.dispatch(refreshSession())?.unwrap();

            if (redirectUrl !== null) {
              store.dispatch(replace(redirectUrl));
            }
          } else {
            const url = location.pathname + location.search + location.hash;
            store.dispatch(logout(url));
          }
        }
      }, COOKIE_POOLING_TIMEOUT);
    }

    next(action);
  };

  return sessionMiddlware;
};
