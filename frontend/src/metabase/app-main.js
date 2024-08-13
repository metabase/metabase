// Enables hot reload in development and noop in production
// MUST be imported BEFORE `react` and `react-dom`
import "metabase-dev";

import { push } from "react-router-redux";
import _ from "underscore";

import { init } from "metabase/app";
import api from "metabase/lib/api";
import { mainReducers } from "metabase/reducers-main";
import { setErrorPage } from "metabase/redux/app";
import { clearCurrentUser } from "metabase/redux/user";
import { getRoutes } from "metabase/routes";

// If any of these receives a 403, we should display the "not authorized" page.
const NOT_AUTHORIZED_TRIGGERS = [
  /\/api\/dashboard\/\d+$/,
  /\/api\/collection\/\d+(?:\/items)?$/,
  /\/api\/card\/\d+$/,
  /\/api\/pulse\/\d+$/,
  /\/api\/dataset$/,
];

init(mainReducers, getRoutes, store => {
  // received a 401 response
  api.on("401", url => {
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

    store.dispatch(clearCurrentUser());
    store.dispatch(push("/auth/login"));
  });

  // received a 403 response
  api.on("403", url => {
    if (NOT_AUTHORIZED_TRIGGERS.some(regex => regex.test(url))) {
      return store.dispatch(setErrorPage({ status: 403 }));
    }
  });
});
