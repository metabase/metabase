import * as React from "react";
import { render, screen } from "@testing-library/react";
import type { ByRoleMatcher } from "@testing-library/react";
import _ from "underscore";
import { createMemoryHistory, History } from "history";
import { Router } from "react-router";
import { routerReducer, routerMiddleware } from "react-router-redux";
import type { Store, Reducer } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { ThemeProvider } from "@emotion/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import type { MatcherFunction } from "@testing-library/dom";

import type { State } from "metabase-types/store";

import { createMockState } from "metabase-types/store/mocks";

import mainReducers from "metabase/reducers-main";
import publicReducers from "metabase/reducers-public";

import { getStore } from "./entities-store";

type ReducerValue = ReducerObject | Reducer;
interface ReducerObject {
  [slice: string]: ReducerValue;
}

export interface RenderWithProvidersOptions {
  mode?: "default" | "public";
  initialRoute?: string;
  storeInitialState?: Partial<State>;
  withRouter?: boolean;
  withDND?: boolean;
  customReducers?: ReducerObject;
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
    initialRoute = "/",
    storeInitialState = {},
    withRouter = false,
    withDND = false,
    customReducers,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  let initialState = createMockState(storeInitialState);

  if (mode === "public") {
    const publicReducerNames = Object.keys(publicReducers);
    initialState = _.pick(initialState, ...publicReducerNames) as State;
  }

  const history = withRouter
    ? createMemoryHistory({ entries: [initialRoute] })
    : undefined;

  let reducers = mode === "default" ? mainReducers : publicReducers;

  if (withRouter) {
    Object.assign(reducers, { routing: routerReducer });
  }
  if (customReducers) {
    reducers = { ...reducers, ...customReducers };
  }

  const store = getStore(
    reducers,
    initialState,
    history ? [routerMiddleware(history)] : [],
  ) as unknown as Store<State>;

  const wrapper = (props: any) => (
    <Wrapper
      {...props}
      store={store}
      history={history}
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
    history,
  };
}

function Wrapper({
  children,
  store,
  history,
  withRouter,
  withDND,
}: {
  children: React.ReactElement;
  store: any;
  history?: History;
  withRouter: boolean;
  withDND: boolean;
}): JSX.Element {
  return (
    <Provider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProvider theme={{}}>
          <MaybeRouter hasRouter={withRouter} history={history}>
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
  history,
}: {
  children: React.ReactElement;
  hasRouter: boolean;
  history?: History;
}): JSX.Element {
  if (!hasRouter) {
    return children;
  }
  return <Router history={history}>{children}</Router>;
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

export function getIcon(name: string, role: ByRoleMatcher = "img") {
  return screen.getByRole(role, { name: `${name} icon` });
}

export function queryIcon(name: string, role: ByRoleMatcher = "img") {
  return screen.queryByRole(role, { name: `${name} icon` });
}

/**
 * Returns a matcher function to find text content that is broken up by multiple elements
 *
 * @param {string} textToFind
 * @example
 * screen.getByText(getBrokenUpTextMatcher("my text with a styled word"))
 */
export function getBrokenUpTextMatcher(textToFind: string): MatcherFunction {
  return (content, element) => element?.textContent === textToFind;
}

export * from "@testing-library/react";
