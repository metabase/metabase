import { Component, type ComponentType, type ReactNode } from "react";
import { type Root, createRoot } from "react-dom/client";

import { getWindow } from "embedding-sdk-shared/lib/get-window";

export type DataAppSdkMountHandle = {
  update: (componentProps: Record<string, unknown>) => void;
  unmount: () => void;
};

type HostComponent = ComponentType<Record<string, unknown>>;

/**
 * Each mount is a separate host root inside the data app's DOM, so an uncaught
 * render error would otherwise escape to the iframe-level handler and take the
 * whole app down with it.
 */
class MediatedMountBoundary extends Component<
  { children?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[data-app] SDK component failed to render:", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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

// Guest-crafted elements are NOT rejected here: `children` is a first-class SDK
// feature (composable `<InteractiveQuestion>` layouts), so scanning props for
// React nodes would break legitimate apps. What such an element could actually
// abuse — having host React materialize a realm-creating tag — is blocked at the
// point of materialization instead, by the host element guard.

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

  const root: Root = createRoot(container);

  const render = (nextComponentProps: Record<string, unknown>) => {
    root.render(
      <MediatedMountBoundary>
        <ComponentProvider {...providerProps}>
          <Component {...nextComponentProps} />
        </ComponentProvider>
      </MediatedMountBoundary>,
    );
  };

  render(componentProps);

  return {
    update: render,
    unmount: () => root.unmount(),
  };
};
