import type { MantineThemeOverride } from "@mantine/core";
import {
  type Middleware,
  type Reducer,
  combineReducers,
} from "@reduxjs/toolkit";
import type { RenderHookOptions } from "@testing-library/react";
import {
  renderHook,
  render as testingLibraryRender,
} from "@testing-library/react";
import { createMemoryHistory } from "history";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { Route, useRouterHistory } from "react-router";
import { routerMiddleware, routerReducer } from "react-router-redux";

import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { AppKBarProvider } from "metabase/AppKBarProvider";
import { admin as adminReducer } from "metabase/admin/admin";
import { Api } from "metabase/api/api";
import { PUT } from "metabase/api/legacy-client";
import { HistoryProvider } from "metabase/history/HistoryProvider";
import * as pulse from "metabase/notifications/pulse/reducers";
import { PLUGIN_REDUCERS } from "metabase/plugins/oss/core";
import * as qb from "metabase/query_builder/reducers";
import { commonReducers } from "metabase/reducers-common";
import { publicReducers } from "metabase/reducers-public";
import { MetabaseReduxProvider } from "metabase/redux/context";
import revisions from "metabase/redux/revisions";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks/state";
import reference from "metabase/reference/reference";
import { RouterProvider } from "metabase/router/RouterProvider";
import { reducer as setupReducer } from "metabase/setup/reducers";
import { ThemeProvider } from "metabase/ui";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { getStore } from "./entities-store";

export * from "./ui-minimal";

let UndoListing: React.ComponentType | undefined;

function LazyUndoListing() {
  if (!UndoListing) {
    const moduleName = "metabase/common/components/UndoListing";
    UndoListing = jest.requireActual(moduleName).UndoListing;
  }

  return <UndoListing />;
}

export interface RenderWithProvidersOptions {
  initialRoute?: string;
  storeInitialState?: Partial<State>;
  mode?: "default" | "public";
  withRouter?: boolean;
  withKBar?: boolean;
  withDND?: boolean;
  withUndos?: boolean;
  customReducers?: Record<string, Reducer<any, any, any>>;
  theme?: MantineThemeOverride;
}

function createStaticReducers(
  initialState: Partial<State>,
  excludedReducers: string[] = [],
) {
  return Object.fromEntries(
    Object.keys(initialState)
      .filter((key) => !excludedReducers.includes(key))
      .map((key) => [key, (state = initialState[key as keyof State]) => state]),
  );
}

function getStoreAndWrapper({
  initialRoute = "/",
  storeInitialState = {},
  mode = "default",
  withRouter = false,
  withKBar = false,
  withDND = false,
  withUndos = false,
  customReducers = {},
  theme,
}: RenderWithProvidersOptions) {
  const { routing, ...initialState }: Partial<State> =
    createMockState(storeInitialState);

  // `useRouterHistory` gives the history a `query` object that some components
  // and hooks rely on to read/write query params.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createMemoryHistory)({
    entries: [initialRoute],
  });
  const history = withRouter ? browserHistory : undefined;

  const realReducers =
    mode === "public"
      ? publicReducers
      : {
          ...commonReducers,
          admin: adminReducer,
          pulse: combineReducers(pulse),
          qb: combineReducers(qb),
          reference,
          revisions,
          setup: setupReducer,
          plugins: combineReducers(PLUGIN_REDUCERS),
          visualizer,
        };

  const reducers = {
    ...createStaticReducers(initialState, [
      ...Object.keys(realReducers),
      history ? "routing" : "",
    ]),
    ...realReducers,
    ...customReducers,
  };
  const middleware: Middleware[] = [Api.middleware];

  // withRouter: tests pass a `<Route>` as the UI, which needs the routing
  // reducer/middleware and the router providers below to be rendered.
  if (history) {
    Object.assign(reducers, { routing: routerReducer });
    Object.assign(initialState, { routing });
    middleware.push(routerMiddleware(history) as Middleware);
  }

  const store = getStore(reducers, initialState, middleware);

  const Wrapper = ({ children }: React.PropsWithChildren): JSX.Element => (
    // MetabaseReduxProvider: components read state via useSelector/useDispatch
    // ("could not find react-redux context value" without it).
    <MetabaseReduxProvider store={store}>
      {/* ThemeProvider supplies MantineProvider + Emotion + DatesProvider,
          without which any `metabase/ui` (Mantine) component throws. */}
      <MaybeDNDProvider hasDND={withDND}>
        <AppColorSchemeProvider
          onUpdateColorScheme={async (value) => {
            await PUT("/api/setting/:key")({ key: "color-scheme", value });
          }}
        >
          <ThemeProvider resolvedColorScheme="light" theme={theme}>
            <>
              {history ? (
                <HistoryProvider history={history}>
                  <MaybeKBar hasKBar={withKBar}>
                    <RouterProvider>{children}</RouterProvider>
                  </MaybeKBar>
                </HistoryProvider>
              ) : (
                <MaybeKBar hasKBar={withKBar}>{children}</MaybeKBar>
              )}
              {withUndos && <LazyUndoListing />}
            </>
          </ThemeProvider>
        </AppColorSchemeProvider>
      </MaybeDNDProvider>
    </MetabaseReduxProvider>
  );

  return { store, history, Wrapper };
}

/**
 * Custom wrapper of react testing library's render function, setting up the
 * providers required to render query_builder / querying components.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const {
    initialRoute,
    storeInitialState,
    mode,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
    ...renderOptions
  } = options;
  const { store, history, Wrapper } = getStoreAndWrapper({
    initialRoute,
    storeInitialState,
    mode,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
  });
  const utils = testingLibraryRender(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });
  return { ...utils, store, history };
}

export function getTestStoreAndWrapper(options: RenderWithProvidersOptions) {
  const { store, history, Wrapper } = getStoreAndWrapper(options);

  return {
    store,
    history,
    wrapper: Wrapper,
  };
}

export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: Omit<RenderHookOptions<TProps>, "wrapper"> &
    RenderWithProvidersOptions = {},
) {
  const {
    initialRoute,
    storeInitialState,
    mode,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
    ...renderHookOptions
  } = options;
  const { store, history, Wrapper } = getStoreAndWrapper({
    initialRoute,
    storeInitialState,
    mode,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
  });

  // With a router, `renderHook` children must sit inside a `<Route>`.
  const HookWrapper = withRouter
    ? ({ children }: React.PropsWithChildren) => (
        <Wrapper>
          <Route path="/" component={() => <>{children}</>} />
        </Wrapper>
      )
    : Wrapper;

  const renderHookReturn = renderHook(hook, {
    wrapper: HookWrapper,
    ...renderHookOptions,
  });
  return { ...renderHookReturn, store, history };
}

function MaybeKBar({
  children,
  hasKBar,
}: React.PropsWithChildren<{ hasKBar: boolean }>): JSX.Element {
  if (!hasKBar) {
    return <>{children}</>;
  }

  return <AppKBarProvider>{children}</AppKBarProvider>;
}

function MaybeDNDProvider({
  children,
  hasDND,
}: React.PropsWithChildren<{ hasDND: boolean }>): JSX.Element {
  if (!hasDND) {
    return <>{children}</>;
  }

  return (
    <DragDropContextProvider backend={HTML5Backend}>
      {children}
    </DragDropContextProvider>
  );
}
