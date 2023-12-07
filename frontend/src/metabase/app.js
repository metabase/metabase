import "regenerator-runtime/runtime";

// Use of classList.add and .remove in Background and FitViewPort Hocs requires
// this polyfill so that those work in older browsers
import "classlist-polyfill";

import "number-to-locale-string";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Should be imported before any other metabase import
import "ee-overrides"; // eslint-disable-line import/no-duplicates

import "metabase/lib/dayjs";

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
import "ee-plugins"; // eslint-disable-line import/no-duplicates

import ReactDOM from "react-dom";
import { Provider } from "react-redux";

// router
import { Router, useRouterHistory } from "react-router";
import { createHistory } from "history";
import { syncHistoryWithStore } from "react-router-redux";

// drag and drop
import HTML5Backend from "react-dnd-html5-backend";
import { DragDropContextProvider } from "react-dnd";
import { ThemeProvider } from "metabase/ui";
import { refreshSiteSettings } from "metabase/redux/settings";
import { initializeEmbedding } from "metabase/lib/embed";
import api from "metabase/lib/api";
import MetabaseSettings from "metabase/lib/settings";
import { createTracker } from "metabase/lib/analytics";
import registerVisualizations from "metabase/visualizations/register";
import { PLUGIN_APP_INIT_FUCTIONS } from "metabase/plugins";

import GlobalStyles from "metabase/styled-components/containers/GlobalStyles";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { getStore } from "./store";

// remove trailing slash
const BASENAME = window.MetabaseRoot.replace(/\/+$/, "");

api.basename = BASENAME;

// eslint-disable-next-line react-hooks/rules-of-hooks
const browserHistory = useRouterHistory(createHistory)({
  basename: BASENAME,
});

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory);
  const routes = getRoutes(store);
  const history = syncHistoryWithStore(browserHistory, store);

  let root;

  createTracker(store);

  initializeEmbedding(store);

  ReactDOM.render(
    <Provider store={store} ref={ref => (root = ref)}>
      <EmotionCacheProvider>
        <DragDropContextProvider backend={HTML5Backend} context={{ window }}>
          <ThemeProvider>
            <GlobalStyles />
            <Router history={history}>{routes}</Router>
          </ThemeProvider>
        </DragDropContextProvider>
      </EmotionCacheProvider>
    </Provider>,
    document.getElementById("root"),
  );

  registerVisualizations();

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
