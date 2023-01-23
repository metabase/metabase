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

export interface RenderWithProvidersOptions {
  mode?: "default" | "public";
  storeInitialState?: Partial<State>;
  withSampleDatabase?: boolean;
  withRouter?: boolean;
  initialRouterPath?: string;
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
    withSampleDatabase,
    withRouter = false,
    initialRouterPath,
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
      withRouter={withRouter}
      initialRouterPath={initialRouterPath}
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
  withRouter,
  initialRouterPath,
  withDND,
}: {
  children: React.ReactElement;
  store: any;
  withRouter: boolean;
  initialRouterPath?: string;
  withDND: boolean;
}): JSX.Element {
  return (
    <Provider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProvider theme={{}}>
          <MaybeRouter
            hasRouter={withRouter}
            initialRouterPath={initialRouterPath}
          >
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
  initialRouterPath = "/",
}: {
  children: React.ReactElement;
  hasRouter: boolean;
  initialRouterPath?: string;
}): JSX.Element {
  if (!hasRouter) {
    return children;
  }
  const history = createMemoryHistory({ entries: [initialRouterPath] });

  function Page(props: any) {
    return React.cloneElement(children, _.omit(props, "children"));
  }

  return (
    <Router history={history}>
      <Route path={initialRouterPath} component={Page} />
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
