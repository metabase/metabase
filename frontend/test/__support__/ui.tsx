import { Global } from "@emotion/react";
import type {
  AnyAction,
  Middleware,
  Reducer,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { MatcherFunction } from "@testing-library/dom";
import type { ByRoleMatcher, RenderHookOptions } from "@testing-library/react";
import {
  renderHook,
  screen,
  render as testingLibraryRender,
  waitFor,
} from "@testing-library/react";
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useMemo,
  useState,
} from "react";
import { DragDropContextProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";
import { createPortal } from "react-dom";
import _ from "underscore";

import "metabase/auth/plugins";
import { AppColorSchemeProvider } from "metabase/AppColorSchemeProvider";
import { AppKBarProvider } from "metabase/AppKBarProvider";
import { Api } from "metabase/api";
import { UndoListing } from "metabase/common/components/UndoListing";
import { baseStyle } from "metabase/css/core/base.styled";
import { makeMainReducers } from "metabase/reducers-main";
import { publicReducers } from "metabase/reducers-public";
import { MetabaseReduxProvider, useDispatch } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  type StoreSeedState,
  createMockState,
} from "metabase/redux/store/mocks";
import {
  type Location,
  type MemoryTestRouterHolder,
  Route,
  type RouteObject,
  RouterProviderMemory,
  createLocationMirror,
  toFacadeLocation,
  toRouteObjects,
} from "metabase/router";
import { useUpdateSettingMutation } from "metabase/settings";
import { getMetabaseCssVariables } from "metabase/styled-components/theme/css-variables";
import type { MantineThemeOverride } from "metabase/ui";
import { PortalContainer, ThemeProvider, useMantineTheme } from "metabase/ui";
import { mutateColors } from "metabase/ui/colors/colors";
import { OverlayStackProvider } from "metabase/ui/components/overlays/overlay-stack";
import { ThemeProviderContext } from "metabase/ui/components/theme/ThemeProvider/context";
import MetabaseSettings from "metabase/utils/settings";

import { getStore } from "./entities-store";

type ReducerValue = ReducerObject | Reducer;

interface ReducerObject {
  [slice: string]: ReducerValue;
}

export interface RenderWithProvidersOptions {
  // the mode changes the reducers and initial state to be used for
  // public or sdk-specific tests
  mode?: "default" | "public";
  initialRoute?: string;
  storeInitialState?: Partial<StoreSeedState>;
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
  const { wrapper, store, router } = getTestStoreAndWrapper({
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
    router,
  };
}

/**
 * Renders route objects, for a spec that has them already, such as the app's own
 * `getRoutes`. Pass a function to build them from the store the harness makes.
 */
export function renderRoutes(
  routes: RouteObject[] | ((store: Store<State>) => RouteObject[]),
  { initialRoute = "/", ...options }: RenderWithProvidersOptions = {},
) {
  const {
    wrapper: Wrapper,
    store,
    router,
  } = getTestStoreAndWrapper({ ...options, initialRoute, withRouter: true });

  const utils = testingLibraryRender(
    <Wrapper routes={typeof routes === "function" ? routes(store) : routes} />,
  );

  return { ...utils, store, router };
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
    router,
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

  const WrapperWithRoute = ({ children, ...props }: any) => {
    return (
      <Wrapper {...props}>
        <Route path="*" element={<>{children}</>} />
      </Wrapper>
    );
  };

  const wrapper = withRouter ? WrapperWithRoute : Wrapper;

  const renderHookReturn = renderHook(hook, { wrapper, ...renderHookOptions });

  return { ...renderHookReturn, store, router };
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
  let {
    // Pull settings and currentUser out because they have no reducer;
    // createMockState mirrors them into the bootstrap / getCurrentUser cache.
    settings,
    currentUser,
    ...initialState
  }: Partial<StoreSeedState> = createMockState(storeInitialState);

  if (mode === "public") {
    const publicReducerNames = Object.keys(publicReducers);
    initialState = _.pick(initialState, ...publicReducerNames);
  }

  // The router can only be built once the route tree is known, which is at
  // render. Specs still get their handle up front, so hand it a holder the
  // provider fills in.
  const routerHolder: MemoryTestRouterHolder = { current: null };
  const router = withRouter ? createTestRouter(routerHolder) : undefined;

  let reducers;

  if (mode === "public") {
    reducers = publicReducers;
  } else {
    reducers = makeMainReducers();
  }

  if (customReducers) {
    reducers = { ...reducers, ...customReducers };
  }

  const storeMiddleware = [Api.middleware];

  // Unjustified type cast. FIXME
  const store = getStore(
    reducers,
    initialState,
    // Unjustified type cast. FIXME
    storeMiddleware as Middleware[],
  ) as unknown as Store<State> & {
    dispatch: ThunkDispatch<State, void, AnyAction>;
  };

  const wrapper = (props: any) => {
    return (
      <TestWrapper
        {...props}
        store={store}
        routerHolder={routerHolder}
        withRouter={withRouter}
        initialRoute={initialRoute}
        withDND={withDND}
        withUndos={withUndos}
        theme={theme}
        withKBar={withKBar}
      />
    );
  };

  return { wrapper, store, router };
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

/**
 * Wires `AppColorSchemeProvider` to the `updateSetting` RTK mutation. Kept as a
 * child component so the hook runs inside the store provider rendered by
 * `TestWrapper`.
 */
const TestColorSchemeProvider = ({ children }: React.PropsWithChildren) => {
  const [updateSetting] = useUpdateSettingMutation();
  const handleUpdateColorScheme = useCallback(
    async (value: any) => {
      await updateSetting({ key: "color-scheme", value }).unwrap();
    },
    [updateSetting],
  );

  return (
    <AppColorSchemeProvider onUpdateColorScheme={handleUpdateColorScheme}>
      {children}
    </AppColorSchemeProvider>
  );
};

export function TestWrapper({
  children,
  routes,
  store,
  routerHolder,
  withRouter,
  initialRoute = "/",
  withKBar,
  withDND,
  withUndos,
  theme,
  displayTheme,
  withCssVariables = false,
}: {
  children?: React.ReactElement;
  /**
   * Routes to mount, for a spec that has them as objects already, such as the
   * app's own `getRoutes`. Takes the place of rendering a `<Route>` tree.
   */
  routes?: RouteObject[];
  store: any;
  routerHolder?: MemoryTestRouterHolder;
  withRouter: boolean;
  initialRoute?: string;
  withKBar: boolean;
  withDND: boolean;
  withUndos?: boolean;
  theme?: MantineThemeOverride;
  displayTheme?: "light" | "dark";
  withCssVariables?: boolean;
}): JSX.Element {
  const [whitelabelColors, setWhitelabelColors] = useState(() =>
    MetabaseSettings.applicationColors(),
  );

  const handleUpdateWhitelabelColors = useCallback((nextColors: any) => {
    mutateColors(nextColors);
    setWhitelabelColors(nextColors);
  }, []);

  return (
    <MetabaseReduxProvider store={store}>
      <MaybeDNDProvider hasDND={withDND}>
        <TestColorSchemeProvider>
          <OverlayStackProvider>
            <ThemeProviderContext.Provider value={{ withCssVariables }}>
              <ThemeProvider
                theme={theme}
                resolvedColorScheme={displayTheme ?? "light"}
                whitelabelColors={whitelabelColors}
                onUpdateWhitelabelColors={handleUpdateWhitelabelColors}
              >
                <GlobalStylesForTest />
                {createPortal(<PortalContainer />, document.body)}

                <MaybeKBar hasKBar={withKBar}>
                  <MaybeRouter
                    hasRouter={withRouter}
                    routes={routes}
                    routerHolder={routerHolder}
                    initialRoute={initialRoute}
                  >
                    {children}
                  </MaybeRouter>
                </MaybeKBar>
                {withUndos && <UndoListing />}
              </ThemeProvider>
            </ThemeProviderContext.Provider>
          </OverlayStackProvider>
        </TestColorSchemeProvider>
      </MaybeDNDProvider>
    </MetabaseReduxProvider>
  );
}

/**
 * The router handle specs drive and assert against, backed by the memory data
 * router.
 */
export type TestRouter = {
  navigate(to: string, options?: { replace?: boolean }): void;
  back(): void;
  forward(): void;
  readonly location: Location;
  /**
   * Observe every location the router passes through, for specs asserting on
   * transient navigations that `location` alone cannot show. Returns an
   * unsubscribe.
   */
  onLocationChange(listener: (location: Location) => void): () => void;
};

function createTestRouter(holder: MemoryTestRouterHolder): TestRouter {
  const requireRouter = () => {
    if (!holder.current) {
      throw new Error("The router handle is only available after render");
    }
    return holder.current;
  };

  // Swallow the router's promise rather than handing it back: specs drive these
  // inside `act()`, which switches to its async mode the moment the callback
  // returns a thenable.
  return {
    navigate: (to, options) => {
      requireRouter().navigate(to, options);
    },
    back: () => {
      requireRouter().navigate(-1);
    },
    forward: () => {
      requireRouter().navigate(1);
    },
    get location() {
      // `toFacadeLocation` normalizes `state` from v7's `null` to `undefined`,
      // which the legacy readers, and the specs covering them, test for.
      return toFacadeLocation(requireRouter().state.location);
    },
    onLocationChange: (listener) => {
      const router = requireRouter();
      // The router notifies on every state update, not just navigations, so
      // compare keys to report a location once.
      let lastKey = router.state.location.key;
      return router.subscribe(({ location }) => {
        if (location.key === lastKey) {
          return;
        }
        lastKey = location.key;
        listener(toFacadeLocation(location));
      });
    },
  };
}

function childrenAreRouteTree(children: React.ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (!isValidElement(child)) {
      return false;
    }
    if (child.type === Route) {
      return true;
    }
    // Routes are often grouped in a fragment (`<><Route/><Route/></>`); descend
    // so the tree is still recognized, matching how react-router unwraps fragments.
    if (child.type === Fragment) {
      return childrenAreRouteTree(child.props.children);
    }
    return false;
  });
}

function MaybeRouter({
  children,
  routes,
  hasRouter,
  routerHolder,
  initialRoute,
}: {
  children?: React.ReactElement;
  routes?: RouteObject[];
  hasRouter: boolean;
  routerHolder?: MemoryTestRouterHolder;
  initialRoute: string;
}): JSX.Element {
  const dispatch = useDispatch();
  const onLocationChange = useMemo(
    () => createLocationMirror(dispatch),
    [dispatch],
  );

  if (!hasRouter) {
    return <>{children}</>;
  }
  return (
    <RouterProviderMemory
      routes={routes ?? toRoutes(children)}
      initialRoute={initialRoute}
      routerHolder={routerHolder}
      onLocationChange={onLocationChange}
    />
  );
}

/**
 * Tests render either a `<Route>` tree or a bare component. Only a bare
 * component needs anything doing to it: it gets a catch-all route to sit in.
 * A spec that has routes as objects passes them as `routes` instead.
 */
function toRoutes(children?: React.ReactElement): RouteObject[] {
  if (!children) {
    return [];
  }
  return toRouteObjects(
    childrenAreRouteTree(children) ? (
      children
    ) : (
      <Route path="*" element={children} />
    ),
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
  return <AppKBarProvider>{children}</AppKBarProvider>;
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

export const createMockDOMRect = (
  overrides: Partial<DOMRect> = {},
): DOMRect => ({
  height: 200,
  width: 200,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
  x: 0,
  y: 0,
  toJSON: () => {},
  ...overrides,
});

/**
 * jsdom doesn't have getBoundingClientRect, so we need to mock it for any components
 * with virtualization to work in tests, like the entity picker
 */
export const mockGetBoundingClientRect = (options: Partial<DOMRect> = {}) => {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockImplementation(() => createMockDOMRect(options));
};

/**
 * Forces `useIsTruncated` (used by `Ellipsified`) to detect overflow, so a
 * hover-triggered truncation tooltip becomes testable.
 */
export const mockTextOverflow = () => {
  jest
    .spyOn(window.Element.prototype, "getBoundingClientRect")
    .mockReturnValue(createMockDOMRect({ width: 100, height: 20 }));
  jest
    .spyOn(window.Range.prototype, "getBoundingClientRect")
    .mockReturnValue(createMockDOMRect({ width: 500, height: 20 }));
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
  // Unjustified type cast. FIXME
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
  <OverlayStackProvider>
    <ThemeProviderContext.Provider value={{ withCssVariables: false }}>
      <ThemeProvider {...props}>
        {createPortal(<PortalContainer />, document.body)}
        {children}
      </ThemeProvider>
    </ThemeProviderContext.Provider>
  </OverlayStackProvider>
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
