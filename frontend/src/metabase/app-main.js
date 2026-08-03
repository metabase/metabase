// Enables hot reload in development and noop in production
// MUST be imported BEFORE `react` and `react-dom`
import "metabase-dev";

import _ from "underscore";

import { Api } from "metabase/api";
import { PLUGIN_API, api } from "metabase/api/client";
import { init } from "metabase/app";
import { setRequestClientHeaders } from "metabase/embedding/lib/auth/set-request-client-headers";
import { mainReducers } from "metabase/reducers-main";
import { setErrorPage } from "metabase/redux/app";
import { push } from "metabase/router";
import { getRoutes } from "metabase/routes";
import { getUser } from "metabase/selectors/user";
import { IFRAMED_IN_SELF, isWithinIframe } from "metabase/utils/iframe";

// Let embedded children detect that their parent is a Metabase instance.
window.METABASE = true;

// If any of these receives a 403, we should display the "not authorized" page.
const NOT_AUTHORIZED_TRIGGERS = [
  /\/api\/dashboard\/\d+$/,
  /\/api\/collection\/\d+(?:\/items)?$/,
  /\/api\/card\/\d+$/,
  /\/api\/pulse\/\d+$/,
];

/**
 * This is the entry point for the core app, so if we're in an iframe (not on metabase itself) we can assume we're in full-app embedding.
 * For the other embedding types we're setting a flag in `frontend/src/metabase/embedding/config.ts`, if we start doing many checks for full-app, we
 * might want to use a flag too instead of just checking for being in an iframe.
 */
if (isWithinIframe() && !IFRAMED_IN_SELF) {
  PLUGIN_API.onBeforeRequestHandlers.setRequestClientHeaders =
    setRequestClientHeaders({ name: "embedding-iframe-full-app" });
}

init(mainReducers, getRoutes, (store) => {
  // received a 401 response
  api.on(401, (url) => {
    if (url.indexOf("/api/user/current") >= 0) {
      return;
    }

    // If SSO is enabled, page url for login with email and password
    // is `/auth/login/password` instead of `/auth/login`.
    // So if call to api when signing in fails, let’s stay in the current page.
    // Otherwise it will always redirect us to the Google auth interaction.
    if (_.contains(["/api/session", "/api/session/"], url)) {
      return;
    }

    // The session is gone, which means every cached API response (including the current
    // user, which the auth route guards read) is stale.
    // Drop them all, but only if there was a session to invalidate.
    // Otherwise, we might be in the middle of a login flow,
    // and dropping the cache would abort the very request carrying the 401.
    if (getUser(store.getState())) {
      store.dispatch(Api.util.resetApiState());
    }
    store.dispatch(push("/auth/login"));
  });

  // received a 403 response
  api.on(403, (url) => {
    if (NOT_AUTHORIZED_TRIGGERS.some((regex) => regex.test(url))) {
      return store.dispatch(setErrorPage({ status: 403 }));
    }
  });
});
