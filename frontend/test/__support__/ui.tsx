import type { MantineThemeOverride } from "@mantine/core";
import type { Store, Reducer } from "@reduxjs/toolkit";
import type { MatcherFunction } from "@testing-library/dom";
import type { ByRoleMatcher } from "@testing-library/react";
import { render, screen, waitFor } from "@testing-library/react";
import type { History } from "history";
import { createMemoryHistory } from "history";
import { KBarProvider } from "kbar";
import type * as React from "react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { Provider } from "react-redux";
import { Router, useRouterHistory } from "react-router";
import { routerReducer, routerMiddleware } from "react-router-redux";
import _ from "underscore";

import { AppInitializeController } from "embedding-sdk/components/private/AppInitializeController";
import { sdkReducers } from "embedding-sdk/store";
import type { SdkStoreState } from "embedding-sdk/store/types";
import { createMockSdkState } from "embedding-sdk/test/mocks/state";
import type { SDKConfig } from "embedding-sdk/types";
import { Api } from "metabase/api";
import { UndoListing } from "metabase/containers/UndoListing";
import mainReducers from "metabase/reducers-main";
import publicReducers from "metabase/reducers-public";
import { EmotionCacheProvider } from "metabase/styled-components/components/EmotionCacheProvider";
import { ThemeProvider } from "metabase/ui";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { getStore } from "./entities-store";

type ReducerValue = ReducerObject | Reducer;

interface ReducerObject {
  [slice: string]: ReducerValue;
}

export interface RenderWithProvidersOptions {
  // the mode changes the reducers and initial state to be used for
  // public or sdk-specific tests
  mode?: "default" | "public" | "sdk";
  initialRoute?: string;
  storeInitialState?: Partial<State>;
  withRouter?: boolean;
  /** Renders children wrapped with kbar provider */
  withKBar?: boolean;
  withDND?: boolean;
  withUndos?: boolean;
  customReducers?: ReducerObject;
  sdkConfig?: SDKConfig | null;
  theme?: MantineThemeOverride;
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
    withKBar = false,
    withDND = false,
    withUndos = false,
    customReducers,
    sdkConfig = null,
    theme,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  let { routing, ...initialState }: Partial<State> =
    createMockState(storeInitialState);

  if (mode === "public") {
    const publicReducerNames = Object.keys(publicReducers);
    initialState = _.pick(initialState, ...publicReducerNames) as State;
  } else if (mode === "sdk") {
    const sdkReducerNames = Object.keys(sdkReducers);
    initialState = _.pick(
      { sdk: createMockSdkState(), ...initialState },
      ...sdkReducerNames,
    ) as SdkStoreState;
  }

  // We need to call `useRouterHistory` to ensure the history has a `query` object,
  // since some components and hooks like `use-sync-url-slug` rely on it to read/write query params.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createMemoryHistory)({
    entries: [initialRoute],
  });
  const history = withRouter ? browserHistory : undefined;

  let reducers;

  if (mode === "sdk") {
    reducers = sdkReducers;
  } else if (mode === "public") {
    reducers = publicReducers;
  } else {
    reducers = mainReducers;
  }

  if (withRouter) {
    Object.assign(reducers, { routing: routerReducer });
    Object.assign(initialState, { routing });
  }
  if (customReducers) {
    reducers = { ...reducers, ...customReducers };
  }

  const storeMiddleware = _.compact([
    Api.middleware,
    history && routerMiddleware(history),
  ]);

  const store = getStore(
    reducers,
    initialState,
    storeMiddleware,
  ) as unknown as Store<State>;

  const wrapper = (props: any) => {
    if (mode === "sdk") {
      return (
        <SdkWrapper {...props} config={sdkConfig} store={store} theme={theme} />
      );
    }

    return (
      <Wrapper
        {...props}
        store={store}
        history={history}
        withRouter={withRouter}
        withDND={withDND}
        withUndos={withUndos}
        theme={theme}
        withKBar={withKBar}
      />
    );
  };

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
  withKBar,
  withDND,
  withUndos,
  theme,
}: {
  children: React.ReactElement;
  store: any;
  history?: History;
  withRouter: boolean;
  withKBar: boolean;
  withDND: boolean;
  withUndos?: boolean;
  theme?: MantineThemeOverride;
}): JSX.Element {
  return (
    <Provider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProvider theme={theme}>
          <MaybeKBar hasKBar={withKBar}>
            <MaybeRouter hasRouter={withRouter} history={history}>
              {children}
            </MaybeRouter>
          </MaybeKBar>
          {withUndos && <UndoListing />}
        </ThemeProvider>
      </MaybeDNDProvider>
    </Provider>
  );
}

function SdkWrapper({
  config,
  children,
  store,
}: {
  config: SDKConfig;
  children: React.ReactElement;
  store: any;
  history?: History;
  withRouter: boolean;
  withDND: boolean;
}) {
  return (
    <Provider store={store}>
      <EmotionCacheProvider>
        <ThemeProvider>
          <AppInitializeController config={config}>
            {children}
          </AppInitializeController>
        </ThemeProvider>
      </EmotionCacheProvider>
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

function MaybeKBar({
  children,
  hasKBar,
}: {
  children: React.ReactElement;
  hasKBar: boolean;
}): JSX.Element {
  if (!hasKBar) {
    return children;
  }
  return <KBarProvider>{children}</KBarProvider>;
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

export function queryIcon(name: string, role: ByRoleMatcher = "img") {
  return screen.queryByRole(role, { name: `${name} icon` });
}

/**
 * Returns a matcher function to find text content that is broken up by multiple elements
 * There is also a version of this for e2e tests - e2e/support/helpers/e2e-misc-helpers.js
 * In case of changes, please, add them there as well
 *
 * @example
 * screen.getByText(getBrokenUpTextMatcher("my text with a styled word"))
 */
export function getBrokenUpTextMatcher(textToFind: string): MatcherFunction {
  return (content, element) => {
    const hasText = (node: Element | null | undefined) =>
      node?.textContent === textToFind;
    const childrenDoNotHaveText = element
      ? Array.from(element.children).every(child => !hasText(child))
      : true;

    return hasText(element) && childrenDoNotHaveText;
  };
}

/**
 * This utility was created as a replacement for waitForElementToBeRemoved.
 * The difference is that waitForElementToBeRemoved expects the element
 * to exist before being removed.
 *
 * The advantage of waitForLoaderToBeRemoved is that it integrates
 * better with our async entity framework because it addresses the
 * non-deterministic aspect of when loading states are displayed.
 *
 * @see https://github.com/metabase/metabase/pull/34272#discussion_r1342527087
 * @see https://metaboat.slack.com/archives/C505ZNNH4/p1684753502335459?thread_ts=1684751522.480859&cid=C505ZNNH4
 */
export const waitForLoaderToBeRemoved = async () => {
  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });
};

/**
 * jsdom doesn't have offsetHeight and offsetWidth, so we need to mock it
 */
export const mockOffsetHeightAndWidth = (value = 50) => {
  jest
    .spyOn(HTMLElement.prototype, "offsetHeight", "get")
    .mockReturnValue(value);
  jest
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockReturnValue(value);
};

/**
 * jsdom doesn't have getBoundingClientRect, so we need to mock it
 */
export const mockGetBoundingClientRect = (options: Partial<DOMRect> = {}) => {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(() => {
      return {
        height: 200,
        width: 200,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
        ...options,
      };
    });
};

/**
 * jsdom doesn't have scrollBy, so we need to mock it
 */
export const mockScrollBy = () => {
  window.Element.prototype.scrollBy = jest.fn();
};

/**
 * jsdom doesn't have scrollBy, so we need to mock it
 */
export const mockScrollTo = () => {
  window.Element.prototype.scrollTo = jest.fn();
};

/**
 * jsdom doesn't have scrollBy, so we need to mock it
 */
export const mockScrollIntoView = () => {
  window.Element.prototype.scrollIntoView = jest.fn();
};

/**
 * jsdom doesn't have DataTransfer
 */
export function createMockClipboardData(
  opts?: Partial<DataTransfer>,
): DataTransfer {
  const clipboardData = { ...opts };
  return clipboardData as unknown as DataTransfer;
}

export * from "@testing-library/react";
