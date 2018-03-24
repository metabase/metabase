/* @flow weak */

import "babel-polyfill";
import "number-to-locale-string";

// If enabled this monkeypatches `t` and `jt` to return blacked out
// strings/elements to assist in finding untranslated strings.
import "metabase/lib/i18n-debug";

// make the i18n function "t" global so we don't have to import it in basically every file
import { t, jt } from "c-3po";
global.t = t;
global.jt = jt;

// set the locale before loading anything else
import { setLocalization } from "metabase/lib/i18n";
if (window.MetabaseLocalization) {
  setLocalization(window.MetabaseLocalization);
}

import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";

import MetabaseAnalytics, {
  registerAnalyticsClickListener,
} from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import api from "metabase/lib/api";

import { getStore } from "./store";

import { refreshSiteSettings } from "metabase/redux/settings";

import { Router, useRouterHistory } from "react-router";
import { createHistory } from "history";
import { syncHistoryWithStore } from "react-router-redux";

// remove trailing slash
const BASENAME = window.MetabaseRoot.replace(/\/+$/, "");

api.basename = BASENAME;

const browserHistory = useRouterHistory(createHistory)({
  basename: BASENAME,
});

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory);
  const routes = getRoutes(store);
  const history = syncHistoryWithStore(browserHistory, store);

  ReactDOM.render(
    <Provider store={store}>
      <Router history={history}>{routes}</Router>
    </Provider>,
    document.getElementById("root"),
  );

  // listen for location changes and use that as a trigger for page view tracking
  history.listen(location => {
    MetabaseAnalytics.trackPageView(location.pathname);
  });

  registerAnalyticsClickListener();

  store.dispatch(refreshSiteSettings());

  // enable / disable GA based on opt-out of anonymous tracking
  MetabaseSettings.on("anon_tracking_enabled", () => {
    window[
      "ga-disable-" + MetabaseSettings.get("ga_code")
    ] = MetabaseSettings.isTrackingEnabled() ? null : true;
  });

  if (callback) {
    callback(store);
  }
}

export function init(...args) {
  if (document.readyState != "loading") {
    _init(...args);
  } else {
    document.addEventListener("DOMContentLoaded", () => _init(...args));
  }
}
