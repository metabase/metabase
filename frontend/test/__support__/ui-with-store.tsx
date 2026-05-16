import type { Middleware, Reducer } from "@reduxjs/toolkit";
import type { RenderHookOptions } from "@testing-library/react";
import {
  renderHook,
  render as testingLibraryRender,
} from "@testing-library/react";
import { createMemoryHistory } from "history";
import { Route, useRouterHistory } from "react-router";
import { routerMiddleware, routerReducer } from "react-router-redux";

import type { State } from "metabase/redux/store";
import { ThemeProvider } from "metabase/ui";

export * from "./ui-minimal";

export interface RenderWithProvidersOptions {
  initialRoute?: string;
  storeInitialState?: Partial<State>;
  withRouter?: boolean;
  customReducers?: Record<string, Reducer<any, any, any>>;
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
  withRouter = false,
  customReducers = {},
}: RenderWithProvidersOptions) {
  const { Api } = require("metabase/api/api");
  const { HistoryProvider } = require("metabase/history/HistoryProvider");
  const { MetabaseReduxProvider } = require("metabase/redux/context");
  const { createMockState } = require("metabase/redux/store/mocks/state");
  const { RouterProvider } = require("metabase/router/RouterProvider");
  const { getStore } = require("./entities-store");

  const { routing, ...initialState }: Partial<State> =
    createMockState(storeInitialState);

  // `useRouterHistory` gives the history a `query` object that some components
  // and hooks rely on to read/write query params.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createMemoryHistory)({
    entries: [initialRoute],
  });
  const history = withRouter ? browserHistory : undefined;

  const reducers = {
    ...createStaticReducers(initialState, [
      "entities",
      "requests",
      history ? "routing" : "",
    ]),
    [Api.reducerPath]: Api.reducer,
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
      <ThemeProvider resolvedColorScheme="light">
        {history ? (
          <HistoryProvider history={history}>
            <RouterProvider>{children}</RouterProvider>
          </HistoryProvider>
        ) : (
          children
        )}
      </ThemeProvider>
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
    withRouter,
    customReducers,
    ...renderOptions
  } = options;
  const { store, history, Wrapper } = getStoreAndWrapper({
    initialRoute,
    storeInitialState,
    withRouter,
    customReducers,
  });
  const utils = testingLibraryRender(ui, {
    wrapper: Wrapper,
    ...renderOptions,
  });
  return { ...utils, store, history };
}

export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  options: Omit<RenderHookOptions<TProps>, "wrapper"> &
    RenderWithProvidersOptions = {},
) {
  const {
    initialRoute,
    storeInitialState,
    withRouter,
    customReducers,
    ...renderHookOptions
  } = options;
  const { store, history, Wrapper } = getStoreAndWrapper({
    initialRoute,
    storeInitialState,
    withRouter,
    customReducers,
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
