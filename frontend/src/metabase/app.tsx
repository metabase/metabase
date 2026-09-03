import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Should be imported before any other metabase import
import "ee-overrides";

// set the locale before loading anything else
import "metabase/utils/i18n";

// NOTE: why do we need to load this here?
import "metabase/ui/colors";

// NOTE: this loads all builtin plugins
import "metabase/auth/plugins";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
// Set CSP nonce for dynamic style injection (e.g. CodeMirror)
import "metabase/utils/csp-setup";

import { type Middleware, isAction } from "@reduxjs/toolkit";
import { DragDropContextProvider } from "react-dnd";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

import { initializePlugins } from "ee-plugins";
import { AppThemeProvider } from "metabase/AppThemeProvider";
import { createSnowplowTracker } from "metabase/analytics";
import { DelayedLoadingSpinner } from "metabase/common/components/DelayedLoading/DelayedLoading";
import { ModifiedBackend } from "metabase/common/components/dnd/ModifiedBackend";
import { getUserId } from "metabase/current-user";
import { registerDashboardVisualizations } from "metabase/dashboard/visualizations/register";
import { initializeInteractiveEmbedding } from "metabase/embedding/interactive-embedding";
import { MetabotProvider } from "metabase/metabot/context";
import { PLUGIN_APP_INIT_FUNCTIONS } from "metabase/plugins";
import { MetabaseReduxProvider } from "metabase/redux";
import {
  LOCATION_CHANGE,
  type Location,
  type RouteObject,
  RouterProvider,
  createLocationMirror,
} from "metabase/router";
import { refetchSiteSettings } from "metabase/settings";
import { GlobalStyles } from "metabase/styled-components/containers/GlobalStyles";
import { PortalContainer } from "metabase/ui";
import { EmotionCacheProvider } from "metabase/ui/components/theme/EmotionCacheProvider";
import { captureClickModifierKeys } from "metabase/urls";
import { setBasename } from "metabase/utils/basename";
import { captureConsoleErrors } from "metabase/utils/errors";
import { initMetaplow } from "metabase/utils/metaplow";
import { initTracing, rotateTraceId } from "metabase/utils/otel";
import MetabaseSettings from "metabase/utils/settings";
import { registerVisualizations } from "metabase/visualizations/register";

import { getStore } from "./store";
import { OverlayStackProvider } from "./ui/components/overlays/overlay-stack";

setBasename(window.MetabaseRoot);

initializePlugins();

type Store = ReturnType<typeof getStore>;

function isLocationChangeAction(
  action: unknown,
): action is { type: typeof LOCATION_CHANGE; payload?: Location } {
  return isAction(action) && action.type === LOCATION_CHANGE;
}

function _init(
  reducers: Parameters<typeof getStore>[0],
  getRoutes: (store: Store) => RouteObject[],
  callback?: (store: Store) => void,
) {
  // Initialize distributed tracing if enabled via MB_TRACING_ENABLED.
  // Uses bootstrap data so it's available before the first API call.
  const extraMiddlewares: Middleware[] = [];
  if (window.MetabaseBootstrap?.["tracing-enabled"]) {
    initTracing();
    // Rotate trace ID on route changes so all API calls within a single page
    // view share one trace. The router emits LOCATION_CHANGE on navigation.
    let lastPathname: string | undefined;
    extraMiddlewares.push(() => (next) => (action) => {
      if (isLocationChangeAction(action)) {
        const pathname = action.payload?.pathname;
        if (pathname !== lastPathname) {
          lastPathname = pathname;
          rotateTraceId();
        }
      }
      return next(action);
    });
  }

  const store = getStore(reducers, undefined, extraMiddlewares);
  const routes = getRoutes(store);
  const mirrorLocation = createLocationMirror(store.dispatch);

  createSnowplowTracker(() => getUserId(store.getState()));
  initMetaplow({
    getUserId: () => getUserId(store.getState()),
  });

  initializeInteractiveEmbedding(store.dispatch);
  // Installing the listener at boot keeps open-url free of import-time work,
  // so importing anything from the urls barrel never registers it as a side effect.
  captureClickModifierKeys();

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("no #root element found");
  }
  const root = createRoot(rootElement);

  root.render(
    <MetabaseReduxProvider store={store}>
      <EmotionCacheProvider>
        <DragDropContextProvider backend={ModifiedBackend} context={{ window }}>
          <OverlayStackProvider>
            <AppThemeProvider>
              <GlobalStyles />
              {createPortal(<PortalContainer />, document.body)}
              <MetabotProvider>
                <RouterProvider
                  routes={routes}
                  onLocationChange={mirrorLocation}
                  hydrateFallback={<DelayedLoadingSpinner />}
                />
              </MetabotProvider>
            </AppThemeProvider>
          </OverlayStackProvider>
        </DragDropContextProvider>
      </EmotionCacheProvider>
    </MetabaseReduxProvider>,
  );

  registerVisualizations();
  registerDashboardVisualizations();

  // Populate the settings cache on load for every app entry.
  // The main app also keeps a live `useGetSettingsQuery` subscription in AppComponent,
  // but the public and embed entries don't mount AppComponent/
  // In RTK if there is no active subscriber, invalidating a tag does not trigger a refetch.
  store.dispatch(refetchSiteSettings());

  PLUGIN_APP_INIT_FUNCTIONS.forEach((init) => init());

  window.Metabase = window.Metabase || {};
  window.Metabase.store = store;
  window.Metabase.settings = MetabaseSettings;

  if (callback) {
    callback(store);
  }
}

export function init(...args: Parameters<typeof _init>) {
  if (document.readyState !== "loading") {
    _init(...args);
  } else {
    document.addEventListener("DOMContentLoaded", () => _init(...args));
  }
}

captureConsoleErrors();
