import "core-js/stable";
import "regenerator-runtime/runtime";
import React from "react";
import ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { ThemeProvider } from "styled-components";
import { Router, useRouterHistory } from "react-router";
import { createHistory } from "history";
import { syncHistoryWithStore } from "react-router-redux";
import HTML5Backend from "react-dnd-html5-backend";
import { DragDropContextProvider } from "react-dnd";
// Use of classList.add and .remove in Background and FitViewPort Hocs requires
// this polyfill so that those work in older browsers
import "classlist-polyfill";
import "number-to-locale-string";
// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
import "ee-plugins"; // eslint-disable-line import/no-unresolved

// If enabled this monkeypatches `t` and `jt` to return blacked out
// strings/elements to assist in finding untranslated strings.
import "metabase/lib/i18n-debug";
// NOTE: why do we need to load this here?
import "metabase/lib/colors";
import "metabase/plugins/builtin";
import { refreshSiteSettings } from "metabase/redux/settings";
import { initializeEmbedding } from "metabase/lib/embed";
import api from "metabase/lib/api";
import MetabaseSettings from "metabase/lib/settings";
import { trackPageView, createTracker } from "metabase/lib/analytics";
import registerVisualizations from "metabase/visualizations/register";
import { PLUGIN_APP_INIT_FUCTIONS } from "metabase/plugins";
import { loadLocalization } from "metabase/lib/i18n";

import { getStore } from "./store";

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

  let root;
  ReactDOM.render(
    <Provider store={store} ref={ref => (root = ref)}>
      <DragDropContextProvider backend={HTML5Backend} context={{ window }}>
        <ThemeProvider theme={theme}>
          <Router history={history}>{routes}</Router>
        </ThemeProvider>
      </DragDropContextProvider>
    </Provider>,
    document.getElementById("root"),
  );

  createTracker(store);
  trackPageView(location.pathname);
  history.listen(location => trackPageView(location.pathname));

  registerVisualizations();

  initializeEmbedding(store);

  store.dispatch(refreshSiteSettings());

  MetabaseSettings.on("user-locale", async locale => {
    // reload locale definition and site settings with the new locale
    await Promise.all([
      loadLocalization(locale),
      store.dispatch(refreshSiteSettings({ locale })),
    ]);
    // force re-render of React application
    root.forceUpdate();
  });

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
