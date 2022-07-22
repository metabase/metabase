import "core-js/stable";
import "regenerator-runtime/runtime";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Use of classList.add and .remove in Background and FitViewPort Hocs requires
// this polyfill so that those work in older browsers
import "classlist-polyfill";

import "number-to-locale-string";

// If enabled this monkeypatches `t` and `jt` to return blacked out
// strings/elements to assist in finding untranslated strings.
import "metabase/lib/i18n-debug";

// set the locale before loading anything else
import "metabase/lib/i18n";

// NOTE: why do we need to load this here?
import "metabase/lib/colors";

// NOTE: this loads all builtin plugins
import "metabase/plugins/builtin";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
import "ee-plugins"; // eslint-disable-line import/no-unresolved

import { PLUGIN_APP_INIT_FUCTIONS } from "metabase/plugins";

import registerVisualizations from "metabase/visualizations/register";

import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { ThemeProvider } from "@emotion/react";

import { createTracker } from "metabase/lib/analytics";
import MetabaseSettings from "metabase/lib/settings";

import api from "metabase/lib/api";
import { initializeEmbedding } from "metabase/lib/embed";

import { getStore } from "./store";

import { refreshSiteSettings } from "metabase/redux/settings";

// router
import { Router, useRouterHistory } from "react-router";
import { createHistory } from "history";
import { syncHistoryWithStore } from "react-router-redux";

// drag and drop
import HTML5Backend from "react-dnd-html5-backend";
import { DragDropContextProvider } from "react-dnd";

import GlobalStyles from "metabase/styled-components/containers/GlobalStyles";

// remove trailing slash
const BASENAME = window.MetabaseRoot.replace(/\/+$/, "");

api.basename = BASENAME;

// eslint-disable-next-line react-hooks/rules-of-hooks
const browserHistory = useRouterHistory(createHistory)({
  basename: BASENAME,
});

const theme = {
  space: [4, 8, 16, 32, 64, 128],
};

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory);
  const routes = getRoutes(store);
  const history = syncHistoryWithStore(browserHistory, store);
  const googleAuthClientId = MetabaseSettings.get("google-auth-client-id");

  let root;

  createTracker(store);

  ReactDOM.render(
    <GoogleOAuthProvider clientId={googleAuthClientId}>
      <Provider store={store} ref={ref => (root = ref)}>
        <DragDropContextProvider backend={HTML5Backend} context={{ window }}>
          <ThemeProvider theme={theme}>
            <GlobalStyles />
            <Router history={history}>{routes}</Router>
          </ThemeProvider>
        </DragDropContextProvider>
      </Provider>
    </GoogleOAuthProvider>,
    document.getElementById("root"),
  );

  registerVisualizations();

  initializeEmbedding(store);

  store.dispatch(refreshSiteSettings());

  PLUGIN_APP_INIT_FUCTIONS.forEach(init => init({ root }));

  window.Metabase = window.Metabase || {};
  window.Metabase.store = store;
  window.Metabase.settings = MetabaseSettings;

  if (callback) {
    callback(store);
  }
}

export function init(...args) {
  if (document.readyState !== "loading") {
    _init(...args);
  } else {
    document.addEventListener("DOMContentLoaded", () => _init(...args));
  }
}
