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
import { useRouterHistory } from "react-router";
import { syncHistoryWithStore } from "react-router-redux";

import { initializePlugins } from "ee-plugins";
import { ModifiedBackend } from "metabase/common/components/dnd/ModifiedBackend";
import { createTracker } from "metabase/lib/analytics";
import api from "metabase/lib/api";
import { initializeEmbedding } from "metabase/lib/embed";
import { captureConsoleErrors } from "metabase/lib/errors";
import { initTracing, rotateTraceId } from "metabase/lib/otel";
import { MetabaseReduxProvider } from "metabase/lib/redux/custom-context";
import MetabaseSettings from "metabase/lib/settings";
import { PLUGIN_APP_INIT_FUNCTIONS, PLUGIN_METABOT } from "metabase/plugins";
import { refreshSiteSettings } from "metabase/redux/settings";
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

// eslint-disable-next-line react-hooks/rules-of-hooks
const browserHistory = useRouterHistory(createHistory)({
  basename: BASENAME,
});

initializePlugins();

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory);
  const routes = getRoutes(store);
  const syncedHistory = syncHistoryWithStore(browserHistory, store);
  const MetabotProvider = PLUGIN_METABOT.getMetabotProvider();

  createTracker(store);

  // Initialize distributed tracing if enabled via MB_TRACING_ENABLED.
  // Uses bootstrap data so it's available before the first API call.
  if (window.MetabaseBootstrap?.["tracing-enabled"]) {
    initTracing();
    // Rotate trace ID on route changes so all API calls within
    // a single page view share one trace.
    syncedHistory.listen(() => rotateTraceId());
  }

  initializeEmbedding(store);

  const root = createRoot(document.getElementById("root"));

  root.render(
    <MetabaseReduxProvider store={store}>
      <EmotionCacheProvider>
        <DragDropContextProvider backend={ModifiedBackend} context={{ window }}>
          <ThemeProvider>
            <GlobalStyles />
            <MetabotProvider>
              <HistoryProvider history={syncedHistory}>
                <RouterProvider>{routes}</RouterProvider>
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
