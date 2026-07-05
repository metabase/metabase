import type { ComponentType } from "react";
import { Route } from "react-router";
import {
  MemoryRouter,
  Navigate as V7Navigate,
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
};

function renderFacade(
  Probe: Probe,
  { initialRoute, facadePath = "*" }: RenderOptions,
) {
  const Mounted = () => <Probe api={facadeApi} />;
  renderWithProviders(<Route path={facadePath} component={Mounted} />, {
    withRouter: true,
    initialRoute,
  });
}

function renderV7(Probe: Probe, { initialRoute, v7Path = "*" }: RenderOptions) {
  renderWithProviders(
    <MemoryRouter initialEntries={[initialRoute]}>
      <V7Routes>
        <V7Route path={v7Path} element={<Probe api={v7Api} />} />
      </V7Routes>
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
