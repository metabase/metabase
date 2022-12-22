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

import type { User } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { createMockUser } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockEmbedState,
} from "metabase-types/store/mocks";

import { getStore } from "./entities-store";

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export interface RenderWithProvidersOptions {
  currentUser?: User;
  reducers?: Record<string, (state: any) => any>;
  storeInitialState?: DeepPartial<State>;
  withSampleDatabase?: boolean;
  withRouter?: boolean;
  withDND?: boolean;
}

const DEFAULT_USER = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby@metabase.test",
  is_superuser: true,
});

/**
 * Custom wrapper of react testing library's render function,
 * helping to setup common wrappers and provider components
 * (router, redux, drag-n-drop provider, etc.)
 */
export function renderWithProviders(
  ui: React.ReactElement,
  {
    currentUser = DEFAULT_USER,
    reducers,
    storeInitialState = {},
    withSampleDatabase,
    withRouter = false,
    withDND = false,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  const initialReduxState = withSampleDatabase
    ? merge(sampleDatabaseReduxState, storeInitialState)
    : storeInitialState;

  const store = getStore(
    {
      currentUser: () => currentUser,
      settings: () => createMockSettingsState(),
      embed: () => createMockEmbedState(),
      ...reducers,
    },
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
  children: React.ReactNode;
  store: any;
  withRouter: boolean;
  withDND: boolean;
}) {
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
  children: React.ReactNode;
  hasRouter: boolean;
}): JSX.Element {
  if (!hasRouter) {
    return <>{children}</>;
  }
  const history = createMemoryHistory({ entries: ["/"] });

  function Page(props: any) {
    return React.cloneElement(<>{children}</>, props);
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
  children: React.ReactNode;
  hasDND: boolean;
}): JSX.Element {
  if (!hasDND) {
    return <>{children}</>;
  }
  return (
    <DragDropContextProvider backend={HTML5Backend}>
      {children}
    </DragDropContextProvider>
  );
}

export * from "@testing-library/react";
