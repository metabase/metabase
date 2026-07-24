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
export function mountDataAppSdkComponent(
  container: HTMLElement,
  ComponentProvider: HostComponent,
  providerProps: Record<string, unknown>,
  Component: HostComponent,
  componentProps: Record<string, unknown>,
): DataAppSdkMountHandle {
  assertTrustedSdkComponents(ComponentProvider, Component);

  const root: Root = createRoot(container);

  const render = (nextComponentProps: Record<string, unknown>) => {
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
}
