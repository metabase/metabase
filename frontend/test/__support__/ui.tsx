import React from "react";
import { render } from "@testing-library/react";
import { merge } from "icepick";
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
    withDND = false,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  const initialReduxState = createMockState(
    withSampleDatabase
      ? merge(sampleDatabaseReduxState, storeInitialState)
      : storeInitialState,
  );

  const store = getStore(
    mode === "default" ? mainReducers : publicReducers,
    initialReduxState,
  );

  const wrapper = (props: any) => (
    <Wrapper
      {...props}
      store={store}
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
  withRouter,
  withDND,
}: {
  children: React.ReactElement;
  store: any;
  withRouter: boolean;
  withDND: boolean;
}): JSX.Element {
  return (
    <Provider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProvider theme={{}}>
          <MaybeRouter hasRouter={withRouter}>{children}</MaybeRouter>
        </ThemeProvider>
      </MaybeDNDProvider>
    </Provider>
  );
}

function MaybeRouter({
  children,
  hasRouter,
}: {
  children: React.ReactElement;
  hasRouter: boolean;
}): JSX.Element {
  if (!hasRouter) {
    return children;
  }
  const history = createMemoryHistory({ entries: ["/"] });

  function Page(props: any) {
    return React.cloneElement(children, props);
  }

  return (
    <Router history={history}>
      <Route path="/" component={Page} />
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

export * from "@testing-library/react";
