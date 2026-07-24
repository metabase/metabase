import { type ComponentType, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";

export type DataAppSdkMountHandle = {
  update: (componentProps: Record<string, unknown>) => void;
  unmount: () => void;
};

type HostComponent = ComponentType<Record<string, unknown>>;

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
 * Endowed to the guest as `__MB_DATA_APP_SDK_MOUNT__`.
 */
export function mountDataAppSdkComponent(
  container: HTMLElement,
  ComponentProvider: HostComponent,
  providerProps: Record<string, unknown>,
  Component: HostComponent,
  componentProps: Record<string, unknown>,
): DataAppSdkMountHandle {
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
