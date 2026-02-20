import { Global } from "@emotion/react";
import type { Reducer, Store } from "@reduxjs/toolkit";
import type { MatcherFunction } from "@testing-library/dom";
import type { ByRoleMatcher, RenderHookOptions } from "@testing-library/react";
import {
  renderHook,
  screen,
  render as testingLibraryRender,
  waitFor,
} from "@testing-library/react";
import type { History, Location } from "history";
import { createMemoryHistory as createMemoryHistoryBase } from "history";
import { KBarProvider } from "kbar";
import type * as React from "react";
import { useMemo } from "react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import {
  unstable_HistoryRouter as HistoryRouter,
  Link as LinkV7,
  Navigate,
  Outlet,
  Route as RouteV7,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import _ from "underscore";

import { Api } from "metabase/api";
import { UndoListing } from "metabase/common/components/UndoListing";
import { baseStyle } from "metabase/css/core/base.styled";
import { HistoryProvider } from "metabase/history";
import { MetabaseReduxProvider } from "metabase/lib/redux";
import { makeMainReducers } from "metabase/reducers-main";
import { publicReducers } from "metabase/reducers-public";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import type { MantineThemeOverride } from "metabase/ui";
import { ThemeProvider, useMantineTheme } from "metabase/ui";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { getStore } from "./entities-store";

type ReducerValue = ReducerObject | Reducer;
const LOCATION_CHANGE = "@@router/LOCATION_CHANGE";
const ROUTER_MARKER = Symbol("legacy-router-marker");

interface ReducerObject {
  [slice: string]: ReducerValue;
}

type Query = Record<string, string>;
type LegacyHistory = History & {
  getCurrentLocation: () => Location & { query: Query };
};

type LegacyRouteObject = {
  path?: string;
  index?: boolean;
  element?: React.ReactElement;
  children?: LegacyRouteObject[];
};

export type InjectedRouter = {
  push: (path: string) => void;
  replace: (path: string) => void;
  go: (count: number) => void;
  goBack: () => void;
  goForward: () => void;
  setRouteLeaveHook: () => () => void;
  createPath: (location: { pathname?: string; search?: string }) => string;
  createHref: (location: { pathname?: string; search?: string }) => string;
  isActive: (path: string) => boolean;
  listen: (listener: () => void) => () => void;
};

export type WithRouterProps = {
  params: Record<string, string | undefined>;
  location: Location;
  router: InjectedRouter;
  route?: { path?: string };
  routes?: Array<{ path?: string }>;
};

type LegacyRouteProps = {
  path?: string;
  component?: React.ComponentType<any>;
  children?: React.ReactNode;
};

type LegacyRedirectProps = {
  from?: string;
  to: string;
};

function parseQuery(search?: string): Query {
  const params = new URLSearchParams(search ?? "");
  return Object.fromEntries(params.entries());
}

function withLocationQuery(location: Location): Location & { query: Query } {
  return {
    ...location,
    query: parseQuery(location.search),
  };
}

function createInjectedRouter(
  navigate: ReturnType<typeof useNavigate>,
): InjectedRouter {
  return {
    push: (path) => navigate(path),
    replace: (path) => navigate(path, { replace: true }),
    go: (count) => navigate(count),
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
    setRouteLeaveHook: () => () => undefined,
    createPath: (location) =>
      `${location.pathname ?? ""}${location.search ?? ""}`,
    createHref: (location) =>
      `${location.pathname ?? ""}${location.search ?? ""}`,
    isActive: (path) => window.location.pathname === path,
    listen: () => () => undefined,
  };
}

export function createMemoryHistory(
  options: Parameters<typeof createMemoryHistoryBase>[0] = {},
): LegacyHistory {
  const history = createMemoryHistoryBase(options) as LegacyHistory;
  const listen = history.listen.bind(history);

  history.listen = ((listener: (location: Location) => void) =>
    listen((update: any) => {
      const location = update?.location ?? update;
      listener(withLocationQuery(location));
    })) as LegacyHistory["listen"];
  history.getCurrentLocation = () => withLocationQuery(history.location);
  return history;
}

export const useRouterHistory =
  <T extends LegacyHistory>(
    createHistory: (
      options?: Parameters<typeof createMemoryHistoryBase>[0],
    ) => T,
  ) =>
  (options?: Parameters<typeof createMemoryHistoryBase>[0]) =>
    createHistory(options);

function withLegacyRouteMarker<T extends React.ComponentType<any>>(
  component: T,
) {
  (component as any)[ROUTER_MARKER] = true;
  return component;
}

export const Route = withLegacyRouteMarker(function Route(
  _props: LegacyRouteProps,
) {
  return null;
});

export const IndexRoute = withLegacyRouteMarker(function IndexRoute(
  _props: Pick<LegacyRouteProps, "component">,
) {
  return null;
});

export const Redirect = withLegacyRouteMarker(function Redirect(
  _props: LegacyRedirectProps,
) {
  return null;
});

export const IndexRedirect = withLegacyRouteMarker(function IndexRedirect(
  _props: Pick<LegacyRedirectProps, "to">,
) {
  return null;
});

export const Link = LinkV7;

const isLegacyRouterElement = (element: React.ReactElement) =>
  Boolean((element.type as any)?.[ROUTER_MARKER]);

function expandOptionalPath(path: string): string[] {
  const match = path.match(/\(([^()]+)\)/);

  if (!match || match.index == null) {
    return [path];
  }

  const [optionalGroup, optionalValue] = match;
  const before = path.slice(0, match.index);
  const after = path.slice(match.index + optionalGroup.length);

  return [
    ...expandOptionalPath(`${before}${after}`),
    ...expandOptionalPath(`${before}${optionalValue}${after}`),
  ];
}

function LegacyComponentElement({
  component: Component,
  path,
}: {
  component?: React.ComponentType<any>;
  path?: string;
}) {
  const location = useLocation() as unknown as Location;
  const params = useParams();
  const navigate = useNavigate();

  if (!Component) {
    return <Outlet />;
  }

  return (
    <Component
      location={location}
      params={params}
      route={{ path }}
      routes={[]}
      router={createInjectedRouter(navigate)}
    />
  );
}

function mapLegacyChildrenToRoutes(
  children: React.ReactNode,
): LegacyRouteObject[] {
  const routes: LegacyRouteObject[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) {
      return;
    }

    if ((child.type as any) === React.Fragment) {
      routes.push(...mapLegacyChildrenToRoutes(child.props.children));
      return;
    }

    if (!isLegacyRouterElement(child)) {
      return;
    }

    if (child.type === IndexRoute) {
      const component = child.props.component as React.ComponentType<any>;
      routes.push({
        index: true,
        element: <LegacyComponentElement component={component} />,
      });
      return;
    }

    if (child.type === IndexRedirect) {
      routes.push({
        index: true,
        element: <Navigate replace to={child.props.to} />,
      });
      return;
    }

    if (child.type === Redirect) {
      const from = child.props.from as string;
      const to = child.props.to as string;
      routes.push({
        path: from,
        element: <Navigate replace to={to} />,
      });
      return;
    }

    const path = child.props.path as string | undefined;
    const expandedPaths = path ? expandOptionalPath(path) : [undefined];
    const component = child.props.component as React.ComponentType<any>;
    const nestedRoutes = mapLegacyChildrenToRoutes(child.props.children);

    expandedPaths.forEach((expandedPath) => {
      routes.push({
        path: expandedPath,
        element: <LegacyComponentElement component={component} path={path} />,
        children: nestedRoutes.length > 0 ? nestedRoutes : undefined,
      });
    });
  });

  return routes;
}

function LegacyRouteRenderer({ children }: { children: React.ReactNode }) {
  const routes = useMemo(() => mapLegacyChildrenToRoutes(children), [children]);
  if (routes.length === 0) {
    return <>{children}</>;
  }
  return <Routes>{routes.map(renderRouteObject)}</Routes>;
}

function renderRouteObject(
  route: LegacyRouteObject,
  index = 0,
): React.ReactElement {
  if (route.index) {
    return <RouteV7 index key={`index-${index}`} element={route.element} />;
  }

  return (
    <RouteV7
      path={route.path}
      key={`${route.path ?? "root"}-${index}`}
      element={route.element}
    >
      {route.children?.map((child, childIndex) =>
        renderRouteObject(child, childIndex),
      )}
    </RouteV7>
  );
}

export function Router({
  history,
  children,
}: {
  history: LegacyHistory;
  children: React.ReactNode;
}) {
  return (
    <HistoryProvider history={history}>
      <HistoryRouter history={history}>
        <LegacyRouteRenderer>{children}</LegacyRouteRenderer>
      </HistoryRouter>
    </HistoryProvider>
  );
}

export function withRouter<P extends object>(
  Component: React.ComponentType<P & WithRouterProps>,
) {
  const Wrapped = (props: P) => {
    const location = useLocation() as unknown as Location;
    const params = useParams();
    const navigate = useNavigate();

    return (
      <Component
        {...props}
        location={location}
        params={params}
        route={{}}
        routes={[]}
        router={createInjectedRouter(navigate)}
      />
    );
  };

  Wrapped.displayName = `WithRouter[${
    Component.displayName ?? Component.name ?? "Component"
  }]`;

  return Wrapped;
}

export interface RenderWithProvidersOptions {
  // the mode changes the reducers and initial state to be used for
  // public or sdk-specific tests
  mode?: "default" | "public";
  initialRoute?: string;
  storeInitialState?: Partial<State>;
  withRouter?: boolean;
  /** Renders children wrapped with kbar provider */
  withKBar?: boolean;
  withDND?: boolean;
  withUndos?: boolean;
  customReducers?: ReducerObject;
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
    theme,
    ...options
  }: RenderWithProvidersOptions = {},
) {
  const { wrapper, store, history } = getTestStoreAndWrapper({
    mode,
    initialRoute,
    storeInitialState,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
  });

  const utils = testingLibraryRender(ui, {
    wrapper,
    ...options,
  });

  return {
    ...utils,
    store,
    history,
  };
}

export function renderHookWithProviders<TProps, TResult>(
  hook: (props: TProps) => TResult,
  {
    mode = "default",
    initialRoute = "/",
    storeInitialState = {},
    withRouter = false,
    withKBar = false,
    withDND = false,
    withUndos = false,
    customReducers,
    theme,
    ...renderHookOptions
  }: Omit<RenderHookOptions<TProps>, "wrapper"> & RenderWithProvidersOptions,
) {
  const {
    wrapper: Wrapper,
    store,
    history,
  } = getTestStoreAndWrapper({
    mode,
    initialRoute,
    storeInitialState,
    withRouter,
    withKBar,
    withDND,
    withUndos,
    customReducers,
    theme,
  });
  const wrapper = Wrapper;

  const renderHookReturn = renderHook(hook, { wrapper, ...renderHookOptions });

  return { ...renderHookReturn, store, history };
}

type GetTestStoreAndWrapperOptions = RenderWithProvidersOptions &
  Pick<Required<RenderWithProvidersOptions>, "initialRoute">;

export function getTestStoreAndWrapper({
  mode,
  initialRoute,
  storeInitialState,
  withRouter,
  withKBar,
  withDND,
  withUndos,
  customReducers,
  theme,
}: GetTestStoreAndWrapperOptions) {
  let { routing, ...initialState }: Partial<State> =
    createMockState(storeInitialState);

  if (mode === "public") {
    const publicReducerNames = Object.keys(publicReducers);
    initialState = _.pick(initialState, ...publicReducerNames) as State;
  }

  // We need to call `useRouterHistory` to ensure the history has a `query` object,
  // since some components and hooks rely on it to read/write query params.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const browserHistory = useRouterHistory(createMemoryHistory)({
    entries: [initialRoute],
  });
  const history = withRouter ? browserHistory : undefined;

  let reducers;

  if (mode === "public") {
    reducers = publicReducers;
  } else {
    reducers = makeMainReducers();
  }

  if (withRouter) {
    Object.assign(reducers, {
      routing: (state = routing, action: any) =>
        action?.type === LOCATION_CHANGE
          ? {
              ...state,
              locationBeforeTransitions: action.payload,
            }
          : state,
    });
    Object.assign(initialState, { routing });
  }
  if (customReducers) {
    reducers = { ...reducers, ...customReducers };
  }

  const storeMiddleware = _.compact([Api.middleware]);

  const store = getStore(
    reducers,
    initialState,
    storeMiddleware,
  ) as unknown as Store<State>;

  if (withRouter && history) {
    history.listen((location) => {
      store.dispatch({
        type: LOCATION_CHANGE,
        payload: {
          ...location,
          query: location.query ?? {},
        },
      });
    });
  }

  const wrapper = (props: any) => {
    return (
      <TestWrapper
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

  return { wrapper, store, history };
}

/**
 * A minimal version of the GlobalStyles component, for use in Storybook stories.
 * Contains strictly only the base styles to act as CSS resets and css variables, without font files.
 **/
const GlobalStylesForTest = () => {
  const theme = useMantineTheme();

  const cssVariables = useMemo(() => {
    return getMetabaseCssVariables({ theme });
  }, [theme]);

  return <Global styles={[baseStyle, cssVariables]} />;
};

export function TestWrapper({
  children,
  store,
  history,
  withRouter,
  withKBar,
  withDND,
  withUndos,
  theme,
  displayTheme,
  withCssVariables = false,
}: {
  children: React.ReactElement;
  store: any;
  history?: History;
  withRouter: boolean;
  withKBar: boolean;
  withDND: boolean;
  withUndos?: boolean;
  theme?: MantineThemeOverride;
  displayTheme?: "light" | "dark";
  withCssVariables?: boolean;
}): JSX.Element {
  return (
    <MetabaseReduxProvider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <ThemeProviderContext.Provider value={{ withCssVariables }}>
          <ThemeProvider theme={theme} displayTheme={displayTheme}>
            <GlobalStylesForTest />

            <MaybeKBar hasKBar={withKBar}>
              <MaybeRouter hasRouter={withRouter} history={history}>
                {children}
              </MaybeRouter>
            </MaybeKBar>
            {withUndos && <UndoListing />}
          </ThemeProvider>
        </ThemeProviderContext.Provider>
      </MaybeDNDProvider>
    </MetabaseReduxProvider>
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
  if (!hasRouter || !history) {
    return children;
  }
  return (
    <HistoryProvider history={history}>
      <Router history={history as LegacyHistory}>{children}</Router>
    </HistoryProvider>
  );
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
      ? Array.from(element.children).every((child) => !hasText(child))
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
  await waitFor(
    () => {
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
      // default timeout is 1s, but sometimes it's not enough and leads to flakiness,
      // 3s should be enough
    },
    { timeout: 3000 },
  );
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
 * jsdom doesn't have getBoundingClientRect, so we need to mock it for any components
 * with virtualization to work in tests, like the entity picker
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
 * Mocked globally in frontend/test/__support__/mocks.js
 */
export const getScrollIntoViewMock = () => {
  return window.HTMLElement.prototype.scrollIntoView;
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

/**
 * jsdom doesn't have MediaQueryList
 */
export const createMockMediaQueryList = (
  opts?: Partial<MediaQueryList>,
): MediaQueryList => ({
  media: "",
  matches: false,
  onchange: jest.fn(),
  dispatchEvent: jest.fn(),
  addListener: jest.fn(),
  addEventListener: jest.fn(),
  removeListener: jest.fn(),
  removeEventListener: jest.fn(),
  ...opts,
});

const ThemeProviderWrapper = ({
  children,
  ...props
}: React.PropsWithChildren) => (
  <ThemeProviderContext.Provider value={{ withCssVariables: false }}>
    <ThemeProvider {...props}>{children}</ThemeProvider>
  </ThemeProviderContext.Provider>
);

export function renderWithTheme(children: React.ReactElement) {
  return testingLibraryRender(children, {
    wrapper: ThemeProviderWrapper,
  });
}

// eslint-disable-next-line import/export -- intentionally overriding render from @testing-library/react
export { renderWithTheme as render };

// eslint-disable-next-line import/export -- intentionally overriding render from @testing-library/react
export * from "@testing-library/react";
