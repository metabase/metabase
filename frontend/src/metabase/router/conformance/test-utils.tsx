import type {
  ComponentType,
  PropsWithChildren,
  ReactElement,
  ReactNode,
} from "react";
import { Route } from "react-router";
import {
  MemoryRouter,
  Navigate as V7Navigate,
  Outlet as V7Outlet,
  Route as V7Route,
  Routes as V7Routes,
  useLocation as v7UseLocation,
  useNavigate as v7UseNavigate,
  useParams as v7UseParams,
  useSearchParams as v7UseSearchParams,
} from "react-router-v7";

import { act, cleanup, renderWithProviders } from "__support__/ui";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "metabase/router";

/**
 * The slice of the router API that both the `metabase/router` facade (running on
 * react-router v3) and real react-router v7 expose with the same names and
 * signatures. A `Probe` receives one of these and cannot tell which engine it is
 * rendered against, which is what lets a single probe drive both adapters.
 */
export type RouterApi = {
  useNavigate: typeof useNavigate;
  useLocation: typeof useLocation;
  useSearchParams: typeof useSearchParams;
  useParams: typeof useParams;
  // Probes only ever pass string destinations, which both engines accept.
  Navigate: ComponentType<{ to: string; replace?: boolean; state?: unknown }>;
};

export const facadeApi: RouterApi = {
  useNavigate,
  useLocation,
  useSearchParams,
  useParams,
  Navigate,
};

/**
 * Real react-router v7's hooks and components share the facade's shapes but not
 * its exact types (v7 adds options like `relative`), so the object is asserted
 * to the shared `RouterApi` rather than structurally assignable.
 */
export const v7Api = {
  useNavigate: v7UseNavigate,
  useLocation: v7UseLocation,
  useSearchParams: v7UseSearchParams,
  useParams: v7UseParams,
  Navigate: V7Navigate,
} as unknown as RouterApi;

/**
 * A probe renders readouts from the router API it is handed. Every readout it
 * emits must be a `data-testid` starting with `rr-` so the harness can collect
 * and compare exactly those, ignoring provider chrome.
 */
export type Probe = ComponentType<{ api: RouterApi }>;

const READOUT_PREFIX = "rr-";

export type RenderOptions = {
  initialRoute: string;
  facadePath?: string;
  v7Path?: string;
  /**
   * Mount the probe in a child route of `facadePath`/`v7Path` instead of in the
   * route itself. The parent route emits the readouts, so they survive a probe
   * that navigates itself out of the tree.
   */
  childPath?: string;
};

function ParentReadouts({
  location,
}: {
  location: { pathname: string; search: string };
}) {
  return (
    <>
      <span data-testid="rr-pathname">{location.pathname}</span>
      <span data-testid="rr-search">{location.search}</span>
    </>
  );
}

function FacadeParent({ children }: { children?: ReactNode }) {
  return (
    <div>
      <ParentReadouts location={useLocation()} />
      {children}
    </div>
  );
}

function V7Parent() {
  return (
    <div>
      <ParentReadouts location={v7UseLocation()} />
      <V7Outlet />
    </div>
  );
}

// Keeps the parent route matched wherever a probe navigates below it, so both
// engines are compared on the destination rather than on an unmatched URL.
const Nothing = () => null;

function renderFacade(
  Probe: Probe,
  { initialRoute, facadePath = "*", childPath }: RenderOptions,
) {
  const Mounted = () => <Probe api={facadeApi} />;
  const tree = childPath ? (
    <Route path={facadePath} component={FacadeParent}>
      <Route path={childPath} component={Mounted} />
      <Route path="*" component={Nothing} />
    </Route>
  ) : (
    <Route path={facadePath} component={Mounted} />
  );

  renderWithProviders(tree, { withRouter: true, initialRoute });
}

function renderV7(
  Probe: Probe,
  { initialRoute, v7Path = "*", childPath }: RenderOptions,
) {
  const probe = <Probe api={v7Api} />;
  const tree = childPath ? (
    <V7Route path={v7Path} element={<V7Parent />}>
      <V7Route path={childPath} element={probe} />
      <V7Route path="*" element={<Nothing />} />
    </V7Route>
  ) : (
    <V7Route path={v7Path} element={probe} />
  );

  renderWithProviders(
    <MemoryRouter initialEntries={[initialRoute]}>
      <V7Routes>{tree}</V7Routes>
    </MemoryRouter>,
  );
}

function collectReadouts(): Record<string, string | null> {
  const nodes = document.querySelectorAll(`[data-testid^="${READOUT_PREFIX}"]`);
  const readouts: Record<string, string | null> = {};
  nodes.forEach((node) => {
    const id = node.getAttribute("data-testid");
    if (id) {
      readouts[id] = node.textContent;
    }
  });
  return readouts;
}

async function settle() {
  // Flush mount effects (e.g. <Navigate>) and the re-render they trigger.
  await act(async () => {});
}

async function renderAndCollect(
  render: () => void,
  interact?: () => Promise<void>,
): Promise<Record<string, string | null>> {
  render();
  // Always unmount, even if a step throws, so one render's `rr-` nodes can never
  // leak into the next.
  try {
    await settle();
    await interact?.();
    return collectReadouts();
  } finally {
    cleanup();
  }
}

/**
 * Render the same probe against the facade and against real v7, running the
 * optional interaction against each, and return the `rr-` readouts from both so
 * a spec can assert they are identical.
 */
export async function runBoth(
  Probe: Probe,
  options: RenderOptions & { interact?: () => Promise<void> },
): Promise<{
  facade: Record<string, string | null>;
  v7: Record<string, string | null>;
}> {
  const { interact, ...renderOptions } = options;

  const facade = await renderAndCollect(
    () => renderFacade(Probe, renderOptions),
    interact,
  );
  const v7 = await renderAndCollect(
    () => renderV7(Probe, renderOptions),
    interact,
  );

  return { facade, v7 };
}

/**
 * The three moving parts of a dynamic/plugin route setup. `featureEnabled`
 * drives the `isEnabled ? real : upsell` conditional; `pluginLoaded` drives the
 * `{PLUGIN_*_ROUTES}` array interpolation (false models an OSS build where the
 * enterprise bundle contributes nothing).
 */
export type DynamicRouteScenario = {
  featureEnabled: boolean;
  pluginLoaded: boolean;
};

/**
 * Constructs one leaf route for a given engine. The facade builds a v3
 * `component=` route, real v7 builds an `element=` route; both render a `Page`
 * emitting the same `rr-page` readout so the harness can compare outcomes.
 */
type LeafRoute = (key: string, path: string, page: string) => ReactElement;

const Passthrough = ({ children }: PropsWithChildren) => <>{children}</>;

const Page = ({ name }: { name: string }) => (
  <span data-testid="rr-page">{name}</span>
);

/**
 * Assembles the sibling routes for a scenario from whichever engine's leaf
 * constructor is supplied, so both engines route the exact same declarative
 * shape: a feature-gated route, an array-interpolated plugin route, and a
 * trailing catch-all.
 */
function dynamicSiblings(route: LeafRoute, scenario: DynamicRouteScenario) {
  const gated = scenario.featureEnabled
    ? route("feature", "feature", "feature")
    : route("feature", "feature", "upsell");
  const pluginRoutes = scenario.pluginLoaded
    ? [route("ee", "ee/reports", "ee-reports")]
    : [];
  const catchAll = route("catch-all", "*", "not-found");
  return [gated, ...pluginRoutes, catchAll];
}

function renderDynamicFacade(
  scenario: DynamicRouteScenario,
  initialRoute: string,
) {
  const leaf: LeafRoute = (key, path, page) => (
    <Route key={key} path={path} component={() => <Page name={page} />} />
  );
  renderWithProviders(
    <Route component={Passthrough}>{dynamicSiblings(leaf, scenario)}</Route>,
    { withRouter: true, initialRoute },
  );
}

function renderDynamicV7(scenario: DynamicRouteScenario, initialRoute: string) {
  const leaf: LeafRoute = (key, path, page) => (
    <V7Route key={key} path={path} element={<Page name={page} />} />
  );
  renderWithProviders(
    <MemoryRouter initialEntries={[initialRoute]}>
      <V7Routes>{dynamicSiblings(leaf, scenario)}</V7Routes>
    </MemoryRouter>,
  );
}

/**
 * Render the same dynamic/plugin route scenario against the facade and against
 * real v7, deep-linking each to `initialRoute`, and return the `rr-` readouts
 * from both so a spec can assert the mechanism resolves identically.
 */
export async function runDynamicBoth(
  scenario: DynamicRouteScenario,
  initialRoute: string,
): Promise<{
  facade: Record<string, string | null>;
  v7: Record<string, string | null>;
}> {
  const facade = await renderAndCollect(() =>
    renderDynamicFacade(scenario, initialRoute),
  );
  const v7 = await renderAndCollect(() =>
    renderDynamicV7(scenario, initialRoute),
  );

  return { facade, v7 };
}
