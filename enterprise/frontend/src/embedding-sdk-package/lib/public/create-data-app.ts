import { type ComponentType, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";

import type { DataAppFactory } from "metabase-enterprise/data_apps/sandbox/types";

type AppComponent = ComponentType<Record<string, unknown>>;

/**
 * A hookless container the host runtime renders; it mounts the real `App` with
 * the bundle's own (guest) ReactDOM, so the app tree is reconciled inside the
 * Near-Membrane sandbox — its hooks resolve against the guest dispatcher and its
 * `createElement` passes through the membrane distortion — instead of being
 * rendered by the host React (which throws "Invalid hook call" / null dispatcher).
 *
 * It must stay hookless: it is rendered by the host React, while this module's
 * `react` import resolves to a different copy, so any hook here throws
 * "Invalid hook call". The guest root is therefore tracked in a closure rather
 * than a ref.
 *
 * That root is torn down when the container detaches. The dev preview's
 * `MetabaseProvider` renders this once as its `ClientSideOnlyWrapper` SSR fallback
 * and again in the client tree; without teardown the fallback's guest App stays
 * alive, and its `ComponentProvider`s keep the `component-providers` single-instance
 * slot — so the live ones never render the portal container, CSS reset or fonts.
 */
function selfMount(App: AppComponent): AppComponent {
  let root: Root | null = null;

  return function DataAppRoot() {
    return createElement("div", {
      style: { height: "100%" },
      ref: (element: HTMLDivElement | null): void => {
        if (element) {
          if (!root) {
            root = createRoot(element);
            root.render(createElement(App));
          }
        } else if (root) {
          const detached = root;
          root = null;
          // Deferred: unmounting a root synchronously inside a ref-detach runs
          // during the host's commit, which React disallows.
          queueMicrotask(() => {
            detached.unmount();
          });
        }
      },
    });
  };
}

/** Wrap a root component into a self-mounting data-app factory. */
export function createDataApp(App: AppComponent): DataAppFactory {
  return () => ({ component: selfMount(App) });
}

/**
 * Wrap an existing factory so its component self-mounts. Applied automatically
 * by the data-app build plugin, so app authors keep writing a normal
 * `() => ({ component })` factory.
 */
export function wrapDataAppFactory(factory: DataAppFactory): DataAppFactory {
  return () => {
    const def = factory();
    return { ...def, component: selfMount(def.component) };
  };
}
