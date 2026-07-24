import { type ComponentType, createElement } from "react";
import { createRoot } from "react-dom/client";

import type { DataAppFactory } from "metabase-enterprise/data_apps/sandbox/types";

type AppComponent = ComponentType<Record<string, unknown>>;

/**
 * A hookless container the host runtime renders; it mounts the real `App` with
 * the bundle's own (guest) ReactDOM, so the app tree is reconciled inside the
 * Near-Membrane sandbox — its hooks resolve against the guest dispatcher and its
 * `createElement` passes through the membrane distortion — instead of being
 * rendered by the host React (which throws "Invalid hook call" / null dispatcher).
 */
function selfMount(App: AppComponent): AppComponent {
  return function DataAppRoot() {
    return createElement("div", {
      style: { height: "100%" },
      ref: (
        element: (HTMLDivElement & { __mounted?: boolean }) | null,
      ): void => {
        if (element && !element.__mounted) {
          element.__mounted = true;
          createRoot(element).render(createElement(App));
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
