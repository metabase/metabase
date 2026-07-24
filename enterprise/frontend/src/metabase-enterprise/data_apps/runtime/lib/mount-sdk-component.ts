import { type ComponentType, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type DataAppSdkMountHandle = {
  update: (componentProps: Record<string, unknown>) => void;
  unmount: () => void;
};

type HostComponent = ComponentType<Record<string, unknown>>;

function assertTrustedSdkComponents(
  ComponentProvider: unknown,
  Component: unknown,
): void {
  const bundle = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE;
  const bundleExports: unknown[] = bundle ? Object.values(bundle) : [];

  if (
    !bundleExports.includes(ComponentProvider) ||
    !bundleExports.includes(Component)
  ) {
    throw new Error(
      "data-app SDK mount: only SDK bundle components may be mounted",
    );
  }
}

const REACT_NODE_TYPES = new Set<unknown>([
  Symbol.for("react.element"),
  Symbol.for("react.portal"),
]);

const MAX_PROP_SCAN_DEPTH = 4;

/**
 * `Symbol.for("react.element")` is realm-shared, so the app can hand-craft an
 * element (e.g. `type: "iframe"`) and smuggle it through props for host React to
 * create ungated — reject any React node reachable in the props.
 */
const assertNoSmuggledReactNodes = (value: unknown, depth = 0): void => {
  if (value === null || typeof value !== "object") {
    return;
  }

  // Read the React element brand off an arbitrary object to detect a smuggled
  // node; the value is untyped caller input, hence the cast.
  const brand = (value as { $$typeof?: unknown }).$$typeof;
  if (REACT_NODE_TYPES.has(brand)) {
    throw new Error(
      "data-app SDK mount: React nodes are not allowed in mediated props",
    );
  }

  if (depth >= MAX_PROP_SCAN_DEPTH) {
    return;
  }

  let values: unknown[];
  try {
    values = Object.values(value);
  } catch {
    return;
  }

  for (const item of values) {
    assertNoSmuggledReactNodes(item, depth + 1);
  }
};

/**
 * Mediated-mount bridge for SDK components in a data app.
 *
 * The data-app bundle runs on its own (guest) React inside the Near-Membrane
 * sandbox; SDK components (`StaticQuestion`, dashboards, …) are HOST React and
 * can't be JSX children of the guest tree. So the guest facade provides a
 * container and calls this — which mounts the host `<ComponentProvider><Component/>`
 * subtree into that container with the HOST ReactDOM (its own realm/hooks),
 * living inside the guest app's DOM. Props/store are passed through the membrane.
 *
 * Endowed to the guest as `__MB_DATA_APP_SDK_MOUNT__`. Only trusted SDK bundle
 * components may be mounted — see [[assertTrustedSdkComponents]].
 */
export const mountDataAppSdkComponent = (
  container: HTMLElement,
  ComponentProvider: HostComponent,
  providerProps: Record<string, unknown>,
  Component: HostComponent,
  componentProps: Record<string, unknown>,
): DataAppSdkMountHandle => {
  assertTrustedSdkComponents(ComponentProvider, Component);
  assertNoSmuggledReactNodes(providerProps);

  const root: Root = createRoot(container);

  const render = (nextComponentProps: Record<string, unknown>) => {
    assertNoSmuggledReactNodes(nextComponentProps);
    root.render(
      createElement(
        ComponentProvider,
        providerProps,
        createElement(Component, nextComponentProps),
      ),
    );
  };

  render(componentProps);

  return {
    update: render,
    unmount: () => root.unmount(),
  };
};
