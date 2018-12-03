import { push } from "react-router-redux";

import { init } from "metabase/app";
import { getRoutes } from "metabase/routes.jsx";
import reducers from "metabase/reducers-main";

import api from "metabase/lib/api";

import { setErrorPage } from "metabase/redux/app";
import { clearCurrentUser } from "metabase/redux/user";

// we shouldn't redirect these URLs because we want to handle them differently
const WHITELIST_FORBIDDEN_URLS = [
  // on dashboards, we show permission errors for individual cards we don't have access to
  /api\/card\/\d+\/query$/,
  // metadata endpoints should not cause redirects
  // we should gracefully handle cases where we don't have access to metadata
  /api\/database\/\d+\/metadata$/,
  /api\/database\/\d+\/fields/,
  /api\/field\/\d+\/values/,
  /api\/table\/\d+\/query_metadata$/,
  /api\/table\/\d+\/fks$/,
];

init(reducers, getRoutes, store => {
  // received a 401 response
  api.on("401", url => {
    if (url.indexOf("/api/user/current") >= 0) {
      return;
    }
    store.dispatch(clearCurrentUser());
    store.dispatch(push("/auth/login"));
  });

  // received a 403 response
  api.on("403", url => {
    if (url) {
      for (const regex of WHITELIST_FORBIDDEN_URLS) {
        if (regex.test(url)) {
          return;
        }
      }
    }
    store.dispatch(setErrorPage({ status: 403 }));
  });
});
