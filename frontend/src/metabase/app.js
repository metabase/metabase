import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@xyflow/react/dist/style.css";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Should be imported before any other metabase import
import "ee-overrides";

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
// Set nonce for mantine v6 deps
import "metabase/lib/csp";

import { createHistory } from "history";
import { DragDropContextProvider } from "react-dnd";
import { createRoot } from "react-dom/client";

import { initializePlugins } from "ee-plugins";
import { ModifiedBackend } from "metabase/common/components/dnd/ModifiedBackend";
import { createTracker } from "metabase/lib/analytics";
import api from "metabase/lib/api";
import { initializeEmbedding } from "metabase/lib/embed";
import { captureConsoleErrors } from "metabase/lib/errors";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_APP_INIT_FUNCTIONS, PLUGIN_METABOT } from "metabase/plugins";
import { refreshSiteSettings } from "metabase/redux/settings";
import { createAppRouterV7 } from "metabase/routing/compat";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { GlobalStyles } from "metabase/styled-components/containers/GlobalStyles";
import { ThemeProvider } from "metabase/ui";
import registerVisualizations from "metabase/visualizations/register";

import { HistoryProvider } from "./history";
import { RouterProvider } from "./router";
import { getStore } from "./store";

// remove trailing slash
const BASENAME = window.MetabaseRoot.replace(/\/+$/, "");

api.basename = BASENAME;

const browserHistory = createHistory({
  basename: BASENAME,
});

initializePlugins();

const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";

const toQuery = (search) => {
  if (!search) {
    return {};
  }

  const normalizedSearch = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(normalizedSearch);
  const query = {};

  for (const [key, value] of params.entries()) {
    query[key] = value;
  }

  return query;
};

const toLocationPayload = (location, action = "POP") => ({
  pathname: location.pathname ?? window.location.pathname,
  search: location.search ?? window.location.search,
  hash: location.hash ?? window.location.hash,
  state: location.state,
  action,
  key: location.key ?? "",
  query: location.query ?? toQuery(location.search),
});

const syncHistoryToStore = (history, store) => {
  const dispatchLocationChange = (location, action) => {
    store.dispatch({
      type: LOCATION_CHANGE,
      payload: toLocationPayload(location, action),
    });
  };

  const currentLocation =
    history.getCurrentLocation?.() ?? history.location ?? window.location;
  dispatchLocationChange(currentLocation, currentLocation.action ?? "POP");

  return history.listen((location) => {
    dispatchLocationChange(location, location.action ?? "POP");
  });
};

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory);
  const routes = getRoutes(store);
  const routerV7 = createAppRouterV7(routes, store);
  syncHistoryToStore(browserHistory, store);
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();

  createTracker(store);

  initializeEmbedding(store);

  const root = createRoot(document.getElementById("root"));

  root.render(
    <MetabaseReduxProvider store={store}>
      <EmotionCacheProvider>
        <DragDropContextProvider backend={ModifiedBackend} context={{ window }}>
          <ThemeProvider>
            <GlobalStyles />
            <MetabotProvider>
              <HistoryProvider history={browserHistory}>
                <RouterProvider routerV7={routerV7} />
              </HistoryProvider>
            </MetabotProvider>
          </ThemeProvider>
        </DragDropContextProvider>
      </EmotionCacheProvider>
    </MetabaseReduxProvider>,
  );

  registerVisualizations();

  store.dispatch(refreshSiteSettings());

  PLUGIN_APP_INIT_FUNCTIONS.forEach((init) => init());

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

captureConsoleErrors();
