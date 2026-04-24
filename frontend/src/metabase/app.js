import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@xyflow/react/dist/style.css";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Should be imported before any other metabase import
import "ee-overrides";

import "metabase/utils/dayjs";

// set the locale before loading anything else
import "metabase/utils/i18n";

// NOTE: why do we need to load this here?
import "metabase/ui/colors";

// NOTE: this loads all builtin plugins
import "metabase/plugins/builtin";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Set CSP nonce for dynamic style injection (e.g. CodeMirror)
import "metabase/utils/csp";

import { createHistory } from "history";
import { DragDropContextProvider } from "react-dnd";
import { createRoot } from "react-dom/client";
import { useRouterHistory } from "react-router";
import { syncHistoryWithStore } from "react-router-redux";

import { initializePlugins } from "ee-plugins";
import { AppThemeProvider } from "metabase/AppThemeProvider";
import { createSnowplowTracker } from "metabase/analytics";
import { ModifiedBackend } from "metabase/common/components/dnd/ModifiedBackend";
import registerDashboardVisualizations from "metabase/dashboard/visualizations/register";
import { MetabotProvider } from "metabase/metabot/context";
import { PLUGIN_APP_INIT_FUNCTIONS } from "metabase/plugins";
import { refreshSiteSettings } from "metabase/redux/settings";
import { getUserId } from "metabase/selectors/user";
import { GlobalStyles } from "metabase/styled-components/containers/GlobalStyles";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";
import api from "metabase/utils/api";
import { initializeEmbedding } from "metabase/utils/embed";
import { captureConsoleErrors } from "metabase/utils/errors";
import { initTracing, rotateTraceId } from "metabase/utils/otel";
import { MetabaseReduxProvider } from "metabase/utils/redux/custom-context";
import MetabaseSettings from "metabase/utils/settings";
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

  createSnowplowTracker(() => getUserId(store.getState()));

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
          <AppThemeProvider>
            <GlobalStyles />
            <MetabotProvider>
              <HistoryProvider history={syncedHistory}>
                <RouterProvider>{routes}</RouterProvider>
              </HistoryProvider>
            </MetabotProvider>
          </AppThemeProvider>
        </DragDropContextProvider>
      </EmotionCacheProvider>
    </MetabaseReduxProvider>,
  );

  registerVisualizations();
  registerDashboardVisualizations();

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
