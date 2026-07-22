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
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

import { initializePlugins } from "ee-plugins";
import { AppThemeProvider } from "metabase/AppThemeProvider";
import { createSnowplowTracker } from "metabase/analytics";
import { ModifiedBackend } from "metabase/common/components/dnd/ModifiedBackend";
import registerDashboardVisualizations from "metabase/dashboard/visualizations/register";
import { initializeInteractiveEmbedding } from "metabase/embedding/interactive-embedding";
import { MetabotProvider } from "metabase/metabot/context";
import { PLUGIN_APP_INIT_FUNCTIONS } from "metabase/plugins";
import { MetabaseReduxProvider } from "metabase/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import {
  getRouterEngine,
  syncHistoryWithStore,
  useRouterHistory,
} from "metabase/router";
import { createV7Navigator } from "metabase/router/v7/navigator";
import { getUserId } from "metabase/selectors/user";
import { GlobalStyles } from "metabase/styled-components/containers/GlobalStyles";
import { PortalContainer } from "metabase/ui";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";
import { getBasename, setBasename } from "metabase/utils/basename";
import { captureConsoleErrors } from "metabase/utils/errors";
import { initMetaplow } from "metabase/utils/metaplow";
import { initTracing, rotateTraceId } from "metabase/utils/otel";
import MetabaseSettings from "metabase/utils/settings";
import { registerVisualizations } from "metabase/visualizations/register";

import { HistoryProvider } from "./history";
import { RouterProvider } from "./router";
import { getStore } from "./store";
import { OverlayStackProvider } from "./ui/components/overlays/overlay-stack";

setBasename(window.MetabaseRoot);

// The v3 engine drives navigation through a `history@3` instance; the v7 engine
// owns its own history and only needs a navigator adapter for redux. Kept for
// instant rollback via the `use-v7-router` flag.
const isV7Router = getRouterEngine() === "v7";
const browserHistory = isV7Router
  ? undefined
  : // eslint-disable-next-line react-hooks/rules-of-hooks
    useRouterHistory(createHistory)({ basename: getBasename() });

initializePlugins();

function _init(reducers, getRoutes, callback) {
  const store = getStore(reducers, browserHistory ?? createV7Navigator());
  const routes = getRoutes(store);
  const syncedHistory = browserHistory
    ? syncHistoryWithStore(browserHistory, store)
    : undefined;

  createSnowplowTracker(() => getUserId(store.getState()));
  initMetaplow({
    getUserId: () => getUserId(store.getState()),
  });

  // Initialize distributed tracing if enabled via MB_TRACING_ENABLED.
  // Uses bootstrap data so it's available before the first API call.
  if (window.MetabaseBootstrap?.["tracing-enabled"]) {
    initTracing();
    // Rotate trace ID on route changes so all API calls within
    // a single page view share one trace.
    if (syncedHistory) {
      syncedHistory.listen(() => rotateTraceId());
    } else {
      // v7 mirrors the location into state.routing; rotate when it changes.
      let lastPathname;
      store.subscribe(() => {
        const { pathname } =
          store.getState().routing.locationBeforeTransitions ?? {};
        if (pathname !== lastPathname) {
          lastPathname = pathname;
          rotateTraceId();
        }
      });
    }
  }

  initializeInteractiveEmbedding(store.dispatch);

  const root = createRoot(document.getElementById("root"));

  const app = <RouterProvider>{routes}</RouterProvider>;

  root.render(
    <MetabaseReduxProvider store={store}>
      <EmotionCacheProvider>
        <DragDropContextProvider backend={ModifiedBackend} context={{ window }}>
          <OverlayStackProvider>
            <AppThemeProvider>
              <GlobalStyles />
              {createPortal(<PortalContainer />, document.body)}
              <MetabotProvider>
                {syncedHistory ? (
                  <HistoryProvider history={syncedHistory}>
                    {app}
                  </HistoryProvider>
                ) : (
                  app
                )}
              </MetabotProvider>
            </AppThemeProvider>
          </OverlayStackProvider>
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
