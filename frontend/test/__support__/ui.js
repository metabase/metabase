/* eslint-disable react/prop-types */
import React from "react";
import { render } from "@testing-library/react";
import { merge } from "icepick";
import { createMemoryHistory } from "history";
import { Router, Route } from "react-router";
import { Provider } from "react-redux";
import { reducer as form } from "redux-form";
import { ThemeProvider } from "@emotion/react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { state as sampleDatabaseReduxState } from "__support__/sample_database_fixture";
import { getStore } from "./entities-store";
import {
  createMockSettingsState,
  createMockEmbedState,
} from "metabase-types/store/mocks";

function getUser(user = {}) {
  return {
    id: 1,
    first_name: "Bobby",
    last_name: "Tables",
    email: "bobby@metabase.test",
    is_superuser: true,
    ...user,
  };
}

/**
 * Custom wrapper of react testing library's render function,
 * helping to setup common wrappers and provider components
 * (router, redux, drag-n-drop provider, etc.)
 *
 * @param {React.ReactElement} ui - JSX to render
 * @param {Option}  prop - various wrapper settings and RTL render options
 *
 * @typedef Option
 * @property {object} [currentUser]
 * @property {{[key: string]: import("redux").Reducer}} [reducers]
 * @property {object} [storeInitialState]
 * @property {boolean} [withSampleDatabase]
 * @property {boolean} [withRouter]
 * @property {boolean} [withDND]
 */
export function renderWithProviders(
  ui,
  {
    currentUser,
    reducers,
    storeInitialState = {},
    withSampleDatabase,
    withRouter = false,
    withDND = false,
    withSettings = false,
    withEmbedSettings = false,
    ...options
  } = {},
) {
  const initialReduxState = withSampleDatabase
    ? merge(sampleDatabaseReduxState, storeInitialState)
    : storeInitialState;

  const store = getStore(
    {
      form,
      currentUser: () => getUser(currentUser),
      settings: withSettings ? () => createMockSettingsState() : undefined,
      embed: withEmbedSettings ? () => createMockEmbedState() : undefined,
      ...reducers,
    },
    initialReduxState,
  );

  const wrapper = props => (
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

function Wrapper({ children, store, withRouter, withDND }) {
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

function MaybeRouter({ children, hasRouter }) {
  if (!hasRouter) {
    return children;
  }
  const history = createMemoryHistory({ initialEntries: ["/"] });

  function Page(props) {
    return React.cloneElement(children, props);
  }

  return (
    <Router history={history}>
      <Route path="/" component={Page} />
    </Router>
  );
}

function MaybeDNDProvider({ children, hasDND }) {
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
