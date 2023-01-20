import React from "react";
import { render, screen } from "@testing-library/react";
import { merge } from "icepick";
import _ from "underscore";
import { createMemoryHistory } from "history";
import { Router, Route } from "react-router";
import { Provider } from "react-redux";
import { ThemeProvider } from "@emotion/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import { state as sampleDatabaseReduxState } from "__support__/sample_database_fixture";

import type { State } from "metabase-types/store";

import { createMockState } from "metabase-types/store/mocks";

import mainReducers from "metabase/reducers-main";
import publicReducers from "metabase/reducers-public";

import { getStore } from "./entities-store";

type RouterOpts = { currentRoute: string; currentLocation: string };

export interface RenderWithProvidersOptions {
  mode?: "default" | "public";
  router?: RouterOpts;
  storeInitialState?: Partial<State>;
  withSampleDatabase?: boolean;
  withRouter?: boolean;
  withDND?: boolean;
}

/**
 * Custom wrapper of react testing library's render function,
 * helping to setup common wrappers and provider components
 * (router, redux, drag-n-drop provider, etc.)
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    mode = "default",
    storeInitialState = {},
    router,
    withSampleDatabase,
    withRouter = false,
    withDND = false,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  let initialState = createMockState(
    withSampleDatabase
      ? merge(sampleDatabaseReduxState, storeInitialState)
      : storeInitialState,
  );

  if (mode === "public") {
    const publicReducerNames = Object.keys(publicReducers);
    initialState = _.pick(initialState, ...publicReducerNames) as State;
  }

  const reducers = mode === "default" ? mainReducers : publicReducers;
  const store = getStore(reducers, initialState);

  const wrapper = (props: any) => (
    <Wrapper
      {...props}
      store={store}
      router={router}
      withRouter={withRouter}
      withDND={withDND}
    />
  );

  const utils = render(ui, {
    wrapper,
    ...options,
  });

  return {
    ...utils,
    store,
  };
}

function Wrapper({
  children,
  store,
  router,
  withRouter,
  withDND,
}: {
  children: React.ReactElement;
  store: any;
  router?: RouterOpts;
  withRouter: boolean;
  withDND: boolean;
}): JSX.Element {
  return (
    <Provider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProvider theme={{}}>
          <MaybeRouter hasRouter={withRouter} router={router}>
            {children}
          </MaybeRouter>
        </ThemeProvider>
      </MaybeDNDProvider>
    </Provider>
  );
}

function MaybeRouter({
  children,
  hasRouter,
  router,
}: {
  children: React.ReactElement;
  hasRouter: boolean;
  router?: RouterOpts;
}): JSX.Element {
  if (!hasRouter) {
    return children;
  }
  const pathname = router?.currentLocation || "/";
  const route = router?.currentRoute || "/";

  const history = createMemoryHistory({ entries: [pathname] });

  function Page(props: any) {
    return React.cloneElement(children, _.omit(props, "children"));
  }

  return (
    <Router history={history}>
      <Route path={route} component={Page} />
    </Router>
  );
}

function MaybeDNDProvider({
  children,
  hasDND,
}: {
  children: React.ReactElement;
  hasDND: boolean;
}): JSX.Element {
  if (!hasDND) {
    return children;
  }
  return (
    <DragDropContextProvider backend={HTML5Backend}>
      {children}
    </DragDropContextProvider>
  );
}

export function getIcon(name: string) {
  return screen.getByLabelText(`${name} icon`);
}

export function queryIcon(name: string) {
  return screen.queryByLabelText(`${name} icon`);
}

export * from "@testing-library/react";
